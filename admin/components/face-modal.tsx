'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { mono, stamp } from '@/lib/format';
import type { Employee, FaceRef } from '@/lib/types';

// The reference is taken here, at the office, with the admin looking at the
// person. Only the embedding the face service makes from it is kept.
export function FaceModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const key = ['faces', employee.id];

  const { data: faces = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<FaceRef[]>(`/employees/${employee.id}/faces`),
  });

  useEffect(() => {
    if (!navigator.mediaDevices) {
      setCameraError('no camera access on this page, it needs https or localhost');
      return;
    }
    let stream: MediaStream | undefined;
    let closed = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })
      .then((s) => {
        // The modal can close before the browser answers the permission prompt.
        if (closed) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((e: Error) => setCameraError(`${e.name}: ${e.message}`));
    return () => {
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  const upload = useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData();
      form.append('photo', photo, 'reference.jpg');
      return apiPost<FaceRef>(`/employees/${employee.id}/faces`, form);
    },
    onSuccess: () => {
      refresh();
      message.success('reference saved');
    },
    // "400 no face in the photo" and "400 2 faces in the photo" come from the face service.
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/employees/${employee.id}/faces/${id}`),
    onSuccess: refresh,
    onError: (e: Error) => message.error(e.message),
  });

  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && upload.mutate(b), 'image/jpeg', 0.92);
  }

  return (
    <Modal
      open
      title={
        <span>
          Reference faces · <span style={mono}>{employee.code}</span> {employee.name}
        </span>
      }
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {cameraError ? (
        <Alert type="warning" showIcon message="camera unavailable" description={cameraError} />
      ) : (
        // Mirrored on screen only; the captured frame is drawn from the stream, unflipped.
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', background: '#111', transform: 'scaleX(-1)' }}
        />
      )}

      <Space style={{ margin: '12px 0' }} wrap>
        <Button
          type="primary"
          onClick={capture}
          disabled={!!cameraError}
          loading={upload.isPending}
        >
          take reference
        </Button>
        <Button onClick={() => file.current?.click()} loading={upload.isPending}>
          upload photo
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = '';
          }}
        />
        <Typography.Text type="secondary">
          one face, looking at the camera, even light
        </Typography.Text>
      </Space>

      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={faces}
        pagination={false}
        locale={{ emptyText: 'no references yet, so every check-in is rejected' }}
        columns={[
          {
            title: 'id',
            dataIndex: 'id',
            render: (id: string) => <span style={mono}>{id.slice(0, 8)}</span>,
          },
          {
            title: 'taken',
            dataIndex: 'createdAt',
            render: (t: string) => <span style={mono}>{stamp(t)}</span>,
          },
          {
            title: '',
            key: 'x',
            width: 70,
            render: (_, f) => (
              <Popconfirm title="delete this reference" onConfirm={() => remove.mutate(f.id)}>
                <Button size="small" danger type="text">
                  delete
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </Modal>
  );
}
