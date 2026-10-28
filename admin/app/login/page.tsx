'use client';

import { Alert, Button, Card, Form, Input } from 'antd';
import { useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(values: { email: string; password: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setBusy(false);
    if (res.ok) window.location.assign('/');
    else setError(res.status === 401 ? 'wrong email or password' : `api said ${res.status}`);
  }

  return (
    <Card title="punchcard admin" style={{ maxWidth: 360, margin: '80px auto' }}>
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="username" autoFocus />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" loading={busy} block>
          Sign in
        </Button>
      </Form>
    </Card>
  );
}
