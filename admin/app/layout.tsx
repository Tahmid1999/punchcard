'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, Button, ConfigProvider, Layout, Menu } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { mono } from '@/lib/format';

const { Header, Content } = Layout;

const NAV = [
  { key: '/', label: <Link href="/">Attendance</Link> },
  { key: '/report', label: <Link href="/report">Month</Link> },
  { key: '/employees', label: <Link href="/employees">Employees</Link> },
  { key: '/offices', label: <Link href="/offices">Offices</Link> },
];

async function signOut() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.assign('/login');
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1 } } }),
  );

  return (
    <html lang="en">
      <head>
        <title>punchcard admin</title>
      </head>
      <body style={{ margin: 0 }}>
        <AntdRegistry>
          <ConfigProvider theme={{ token: { colorPrimary: '#2b4c3f' } }}>
            <QueryClientProvider client={client}>
              <App>
                <Layout style={{ minHeight: '100vh' }}>
                  {pathname !== '/login' && (
                    <Header
                      style={{ display: 'flex', alignItems: 'center', gap: 24, paddingInline: 16 }}
                    >
                      <span style={{ ...mono, color: '#fff', fontWeight: 600 }}>punchcard</span>
                      <Menu
                        theme="dark"
                        mode="horizontal"
                        selectedKeys={[pathname]}
                        items={NAV}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <Button size="small" type="text" style={{ color: '#bbb' }} onClick={signOut}>
                        sign out
                      </Button>
                    </Header>
                  )}
                  <Content style={{ padding: 16 }}>{children}</Content>
                </Layout>
              </App>
            </QueryClientProvider>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
