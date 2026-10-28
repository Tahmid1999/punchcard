'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';

import { apiGet } from '@/lib/api';
import { clock, hoursBetween, mono, monthDays, weekday } from '@/lib/format';
import type { Report, ReportDay } from '@/lib/types';

type Row = Report['employees'][number];

const CELL = 44;

function Cell({ d }: { d?: ReportDay }) {
  if (!d) return null;
  const worked = d.firstIn && d.lastOut ? hoursBetween(d.firstIn, d.lastOut) : '';
  const tip = [
    d.firstIn && `in ${clock(d.firstIn)}`,
    d.lastOut && `out ${clock(d.lastOut)}`,
    worked && `${worked} worked`,
    d.rejected > 0 && `${d.rejected} rejected`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Tooltip title={tip}>
      <div style={{ ...mono, fontSize: 11, lineHeight: '14px' }}>
        <div>
          {d.firstIn ? clock(d.firstIn) : <Typography.Text type="secondary">--</Typography.Text>}
        </div>
        <div style={{ color: '#888' }}>{d.lastOut ? clock(d.lastOut) : ''}</div>
        {d.rejected > 0 && <div style={{ color: '#cf1322' }}>×{d.rejected}</div>}
      </div>
    </Tooltip>
  );
}

function toCsv(report: Report): string {
  const lines = ['code,name,day,in,out,rejected'];
  for (const e of report.employees) {
    for (const d of e.days) {
      const name = `"${e.name.replace(/"/g, '""')}"`;
      lines.push(
        [
          e.code,
          name,
          d.day,
          d.firstIn ? clock(d.firstIn) : '',
          d.lastOut ? clock(d.lastOut) : '',
          d.rejected,
        ].join(','),
      );
    }
  }
  return lines.join('\n') + '\n';
}

function download(report: Report) {
  const url = URL.createObjectURL(new Blob([toCsv(report)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `punchcard-${report.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MonthReport() {
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const { data, isLoading } = useQuery({
    queryKey: ['report', month],
    queryFn: () => apiGet<Report>(`/attendance/report?month=${month}`),
  });

  const days = monthDays(month);
  const columns: ColumnsType<Row> = [
    {
      title: 'employee',
      key: 'employee',
      fixed: 'left',
      width: 180,
      render: (_, e) => (
        <span>
          <span style={mono}>{e.code}</span> {e.name}
        </span>
      ),
    },
    {
      title: 'days',
      dataIndex: 'present',
      fixed: 'left',
      width: 56,
      align: 'right',
      render: (n: number) => <span style={mono}>{n}</span>,
    },
    ...days.map((day) => {
      // antd's default cell padding leaves 30 px, which splits "08:55" in two.
      const style = { padding: '4px 2px', background: weekday(day) === 5 ? '#ebebeb' : undefined };
      const shade = { style };
      return {
        title: <span style={{ ...mono, fontSize: 11 }}>{day.slice(8)}</span>,
        key: day,
        width: CELL,
        align: 'center' as const,
        onHeaderCell: () => shade,
        onCell: () => shade,
        render: (_: unknown, e: Row) => <Cell d={e.days.find((d) => d.day === day)} />,
      };
    }),
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <DatePicker
          picker="month"
          allowClear={false}
          value={dayjs(`${month}-01`)}
          onChange={(d) => d && setMonth(d.format('YYYY-MM'))}
        />
        <Button disabled={!data} onClick={() => data && download(data)}>
          csv
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          first accepted IN over last accepted OUT, in {data?.timezone ?? 'office'} time. Fridays
          shaded.
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        size="small"
        bordered
        loading={isLoading}
        columns={columns}
        dataSource={data?.employees ?? []}
        pagination={false}
        scroll={{ x: 236 + days.length * CELL }}
      />
    </>
  );
}
