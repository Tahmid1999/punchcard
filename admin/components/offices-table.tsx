'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Table, Typography } from 'antd';
import { useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { mono } from '@/lib/format';
import type { Office } from '@/lib/types';

type NewOffice = Omit<Office, 'id'>;

export function OfficesTable() {
  const [form] = Form.useForm<NewOffice>();
  const [fix, setFix] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data = [], isLoading } = useQuery({
    queryKey: ['offices'],
    queryFn: () => apiGet<Office[]>('/offices'),
  });

  const create = useMutation({
    mutationFn: (v: NewOffice) => apiPost<Office>('/offices', v),
    onSuccess: () => {
      form.resetFields();
      setFix(null);
      void queryClient.invalidateQueries({ queryKey: ['offices'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // Laptop location is often Wi-Fi based and off by hundreds of metres, so the
  // accuracy is shown next to it. Reading the point off a map is usually better.
  function here() {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        form.setFieldsValue({
          lat: Number(p.coords.latitude.toFixed(6)),
          lng: Number(p.coords.longitude.toFixed(6)),
        });
        setFix(`±${Math.round(p.coords.accuracy)} m`);
      },
      (e) => message.error(`location: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <>
      <Form
        form={form}
        layout="inline"
        onFinish={(v) => create.mutate(v)}
        initialValues={{ radiusM: 80 }}
        style={{ marginBottom: 12, rowGap: 8 }}
        requiredMark={false}
      >
        <Form.Item name="name" rules={[{ required: true, max: 120 }]}>
          <Input placeholder="name" style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="lat" rules={[{ required: true }]}>
          <InputNumber
            placeholder="lat"
            min={-90}
            max={90}
            step={0.0001}
            style={{ ...mono, width: 130 }}
          />
        </Form.Item>
        <Form.Item name="lng" rules={[{ required: true }]}>
          <InputNumber
            placeholder="lng"
            min={-180}
            max={180}
            step={0.0001}
            style={{ ...mono, width: 130 }}
          />
        </Form.Item>
        <Form.Item name="radiusM" rules={[{ required: true }]}>
          <InputNumber min={30} max={2000} addonAfter="m" style={{ ...mono, width: 120 }} />
        </Form.Item>
        <Form.Item>
          <Button onClick={here}>use my location</Button>
          {fix && (
            <Typography.Text type="secondary" style={{ ...mono, marginLeft: 8 }}>
              {fix}
            </Typography.Text>
          )}
        </Form.Item>
        <Button htmlType="submit" loading={create.isPending}>
          add office
        </Button>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'name', dataIndex: 'name' },
          {
            title: 'centre',
            key: 'centre',
            render: (_, o) => (
              <a
                href={`https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lng}#map=18/${o.lat}/${o.lng}`}
                target="_blank"
                rel="noreferrer"
                style={mono}
              >
                {o.lat.toFixed(5)}, {o.lng.toFixed(5)}
              </a>
            ),
          },
          {
            title: 'radius',
            dataIndex: 'radiusM',
            width: 90,
            align: 'right',
            render: (r: number) => <span style={mono}>{r} m</span>,
          },
        ]}
      />
    </>
  );
}
