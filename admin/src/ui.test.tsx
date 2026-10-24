// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Badge, Button, Empty, Input } from './ui';
import Login from './pages/Login';
import Layout from './layout';
import { useStore } from './store';

afterEach(() => cleanup());

function shell(role: 'SUPER_ADMIN' | 'SUPPORT', email: string) {
  useStore.setState({ admin: { id: 't', email, role } });
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<div>home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ui primitives', () => {
  it('Badge renders text', () => {
    render(<Badge tone="green">ACTIVE</Badge>);
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });
  it('Button renders label and variants', () => {
    const { rerender } = render(<Button>Save</Button>);
    expect(screen.getByText('Save')).toBeTruthy();
    rerender(<Button variant="danger">Delete</Button>);
    expect(screen.getByText('Delete')).toBeTruthy();
  });
  it('Empty shows helper text', () => {
    render(<Empty text="No orders" />);
    expect(screen.getByText('No orders')).toBeTruthy();
  });
  it('Input accepts typing', () => {
    render(<Input placeholder="Type here" />);
    const el = screen.getByPlaceholderText('Type here') as HTMLInputElement;
    fireEvent.change(el, { target: { value: 'hello' } });
    expect(el.value).toBe('hello');
  });
});

describe('Login page', () => {
  it('renders email + password with dev defaults and no 2FA field', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByText('TZ Store Admin')).toBeTruthy();
    const email = screen.getByDisplayValue('toolzenux@gmail.com');
    expect(email).toBeTruthy();
    expect(screen.queryByPlaceholderText('••••••')).toBeNull();
    expect(screen.queryByText(/2FA/i)).toBeNull();
  });
});

describe('Layout nav by role', () => {
  it('SUPER_ADMIN sees Admins & Audit', () => {
    shell('SUPER_ADMIN', 'a@x.io');
    expect(screen.getByText('Admins & Audit')).toBeTruthy();
  });
  it('SUPPORT does not see Admins & Audit', () => {
    shell('SUPPORT', 's@x.io');
    expect(screen.queryByText('Admins & Audit')).toBeNull();
    expect(screen.getAllByText('Dashboard')[0]).toBeTruthy();
  });
});
