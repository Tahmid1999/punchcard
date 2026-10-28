'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { mono, stamp } from '@/lib/format';
import type { Employee } from '@/lib/types';
import { FaceModal } from './face-modal';
import { PairingModal } from './pairing-modal';

export function EmployeesTable() {
  const [faceFor, setFaceFor] = useState<Employee | null>(null);
  const [pairFor, setPairFor] = useState<Employee | null>(null);
  const [form] = Form.useForm<{ code: string; name: string }>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiGet<Employee[]>('/employees'),
    // While a pairing QR is up, watch for the phone to show up.
    refetchInterval: pairFor ? 2000 : false,
  });

  const create = useMutation({
    mutationFn: (v: { code: string; name: string }) => apiPost<Employee>('/employees', v),
    onSuccess: (e) => {
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      message.success(`added ${e.code}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const columns: ColumnsType<Employee> = [
    {
      title: 'code',
      dataIndex: 'code',
      width: 110,
      render: (c: string) => <span style={mono}>{c}</span>,
    },
    { title: 'name', dataIndex: 'name' },
    {
      title: 'phone',
      key: 'phone',
      width: 280,
      render: (_, e) => {
        const d = e.devices[0];
        if (!d) return <Typography.Text type="secondary">not paired</Typography.Text>;
        return (
          <span>
            {d.model ?? 'unknown model'}{' '}
            <Typography.Text type="secondary" style={{ ...mono, fontSize: 12 }}>
              {stamp(d.pairedAt)}
            </Typography.Text>
          </span>
        );
      },
    },
    {
      title: 'faces',
      key: 'faces',
      width: 80,
      align: 'right',
      render: (_, e) =>
        e._count.faces === 0 ? (
          <Tag color="warning">none</Tag>
        ) : (
          <span style={mono}>{e._count.faces}</span>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 170,
      render: (_, e) => (
        <Space size={4}>
          <Button size="small" onClick={() => setFaceFor(e)}>
            faces
          </Button>
          <Button size="small" onClick={() => setPairFor(e)} disabled={!e.active}>
            pair phone
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Form
        form={form}
        layout="inline"
        onFinish={(v) => create.mutate(v)}
        style={{ marginBottom: 12 }}
        requiredMark={false}
      >
        <Form.Item
          name="code"
          rules={[
            { required: true, pattern: /^[A-Z0-9-]{2,20}$/, message: 'A-Z, 0-9 and -, 2 to 20' },
          ]}
          normalize={(v: string) => v.toUpperCase()}
        >
          <Input placeholder="code, e.g. E-014" style={{ ...mono, width: 160 }} />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, max: 120 }]}>
          <Input placeholder="full name" style={{ width: 240 }} />
        </Form.Item>
        <Button htmlType="submit" loading={create.isPending}>
          add employee
        </Button>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data}
        pagination={false}
      />

      {faceFor && <FaceModal employee={faceFor} onClose={() => setFaceFor(null)} />}
      {pairFor && (
        <PairingModal
          employee={pairFor}
          current={data.find((e) => e.id === pairFor.id) ?? pairFor}
          onClose={() => setPairFor(null)}
        />
      )}
    </>
  );
}
