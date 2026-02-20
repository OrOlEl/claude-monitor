import './globals.css';

export const metadata = {
  title: 'Claude Monitor',
  description: 'Real-time monitoring dashboard for Claude Code',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
