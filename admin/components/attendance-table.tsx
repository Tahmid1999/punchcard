'use client';

import { useQuery } from '@tanstack/react-query';
import { DatePicker, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';

import { apiGet } from '@/lib/api';
import { mono, stamp } from '@/lib/format';
import type { Attendance, Employee } from '@/lib/types';

const CHECKS = [
  ['signatureOk', 'sig', 'fingerprint key signature'],
  ['photoOk', 'photo', 'photo matches the signed hash'],
  ['locationOk', 'gps', 'inside the office radius, real fix, accuracy ≤ 100 m'],
  ['faceOk', 'face', 'face matches a reference'],
] as const;

// Grey means the check never ran: the server stops at the first one that fails.
function Checks({ row }: { row: Attendance }) {
  return (
    <Space size={2}>
      {CHECKS.map(([field, label, what]) => {
        const v = row[field];
        return (
          <Tooltip key={field} title={what}>
            <Tag
              color={v === true ? 'success' : v === false ? 'error' : 'default'}
              style={{ ...mono, marginInlineEnd: 0, fontSize: 11 }}
            >
              {label}
            </Tag>
          </Tooltip>
        );
      })}
    </Space>
  );
}

const num = (v: number | null, digits: number, unit = '') =>
  v === null ? (
    <Typography.Text type="secondary">-</Typography.Text>
  ) : (
    <span style={mono}>
      {v.toFixed(digits)}
      {unit}
    </span>
  );

const columns: ColumnsType<Attendance> = [
  {
    title: 'time',
    dataIndex: 'at',
    width: 170,
    render: (t: string) => <span style={{ ...mono, whiteSpace: 'nowrap' }}>{stamp(t)}</span>,
  },
  {
    title: 'employee',
    key: 'employee',
    width: 200,
    render: (_, r) => (
      <span>
        <span style={mono}>{r.employee.code}</span> {r.employee.name}
      </span>
    ),
  },
  {
    title: 'kind',
    dataIndex: 'kind',
    width: 60,
    render: (k: string) => <span style={mono}>{k}</span>,
  },
  {
    title: 'result',
    dataIndex: 'result',
    width: 100,
    filters: [
      { text: 'accepted', value: 'ACCEPTED' },
      { text: 'rejected', value: 'REJECTED' },
    ],
    onFilter: (v, r) => r.result === v,
    render: (r: string) => <Tag color={r === 'ACCEPTED' ? 'green' : 'red'}>{r.toLowerCase()}</Tag>,
  },
  { title: 'checks', key: 'checks', width: 210, render: (_, r) => <Checks row={r} /> },
  {
    title: 'dist',
    dataIndex: 'distanceM',
    width: 70,
    align: 'right',
    render: (v: number | null) => num(v, 0, ' m'),
  },
  {
    title: 'acc',
    dataIndex: 'accuracyM',
    width: 70,
    align: 'right',
    render: (v: number) => num(v, 0, ' m'),
  },
  {
    title: 'face',
    dataIndex: 'faceScore',
    width: 70,
    align: 'right',
    render: (v: number | null) => num(v, 3),
  },
  {
    title: 'reason',
    dataIndex: 'reason',
    render: (r: string | null, row) =>
      r ? (
        <span>
          {r}
          {row.mock && ' (mock)'}
        </span>
      ) : null,
  },
];

export function AttendanceTable() {
  const [employeeId, setEmployeeId] = useState<string>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const qs = new URLSearchParams({ limit: '500' });
  if (employeeId) qs.set('employeeId', employeeId);
  if (range?.[0]) qs.set('from', range[0].startOf('day').toISOString());
  if (range?.[1]) qs.set('to', range[1].add(1, 'day').startOf('day').toISOString());

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiGet<Employee[]>('/employees'),
  });
  const {
    data = [],
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['attendance', qs.toString()],
    queryFn: () => apiGet<Attendance[]>(`/attendance?${qs}`),
    refetchInterval: 10_000,
  });

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          allowClear
          showSearch
          placeholder="all employees"
          style={{ width: 240 }}
          value={employeeId}
          onChange={setEmployeeId}
          optionFilterProp="label"
          options={employees.map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))}
        />
        <DatePicker.RangePicker value={range} onChange={setRange} />
        <Typography.Text type="secondary" style={{ ...mono, fontSize: 12 }}>
          {data.length} rows{data.length === 500 && ', newest 500 only'} · refreshed{' '}
          {dataUpdatedAt ? stamp(new Date(dataUpdatedAt).toISOString()).slice(11) : '-'}
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: 1100 }}
      />
    </>
  );
}
