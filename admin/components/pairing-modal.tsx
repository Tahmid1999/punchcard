'use client';

import { useMutation } from '@tanstack/react-query';
import { Alert, Modal, QRCode, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { apiPost } from '@/lib/api';
import { countdown, mono } from '@/lib/format';
import type { Employee, Pairing } from '@/lib/types';

const PHONE_API = process.env.NEXT_PUBLIC_PHONE_API_URL ?? 'http://localhost:3200';

// `current` is the same employee from the list the parent keeps refetching.
// When its phone differs from the one it had when the modal opened, the scan worked.
export function PairingModal({
  employee,
  current,
  onClose,
}: {
  employee: Employee;
  current: Employee;
  onClose: () => void;
}) {
  const before = useRef(employee.devices[0]?.id);
  const [now, setNow] = useState(() => Date.now());

  const issue = useMutation({
    mutationFn: () => apiPost<Pairing>(`/employees/${employee.id}/pairing`),
  });
  const { mutate } = issue;

  // Strict mode runs effects twice in dev, which would hand out two codes.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate();
  }, [mutate]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const phone = current.devices[0];
  const paired = phone && phone.id !== before.current ? phone : null;
  const left = issue.data ? Date.parse(issue.data.expiresAt) - now : 0;
  const value = issue.data
    ? `punchcard://pair?api=${encodeURIComponent(PHONE_API)}&code=${issue.data.code}`
    : 'loading';

  let status: 'active' | 'expired' | 'loading' | 'scanned' = 'active';
  if (paired) status = 'scanned';
  else if (issue.isPending) status = 'loading';
  else if (left <= 0) status = 'expired';

  return (
    <Modal
      open
      title={`Pair a phone · ${employee.code} ${employee.name}`}
      onCancel={onClose}
      footer={null}
      width={420}
    >
      {issue.error && <Alert type="error" message={issue.error.message} />}
      <Space direction="vertical" align="center" style={{ width: '100%' }}>
        <QRCode value={value} size={280} status={status} onRefresh={() => mutate()} />
        {paired ? (
          <Alert
            type="success"
            showIcon
            message={`paired: ${paired.model ?? 'unknown model'}`}
            description={before.current ? 'The old phone can no longer check in.' : undefined}
          />
        ) : (
          <>
            <Typography.Text style={mono}>
              {left > 0 ? `expires in ${countdown(left)}` : 'expired'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
              Scan in the punchcard app. One use only.
              {employee.devices[0] && ' Pairing a new phone ends the current one.'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ ...mono, fontSize: 11 }}>
              {PHONE_API}
            </Typography.Text>
          </>
        )}
      </Space>
    </Modal>
  );
}
