import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/library' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { GATE_TITLES, SignInGate } from './SignInGate';

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no <dialog> behaviour yet.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

describe('SignInGate', () => {
  it('shows the preview title, the body and three actions', () => {
    render(<SignInGate open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Want the rest of this song?' })).toBeTruthy();
    expect(
      screen.getByText('Sign in free to hear full songs, build playlists and listen with friends.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/sign-in?redirect_url=%2Flibrary',
    );
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/sign-up?redirect_url=%2Flibrary',
    );
    expect(screen.getByRole('button', { name: 'Keep browsing' })).toBeTruthy();
  });
  it('uses the context title for each reason', () => {
    render(<SignInGate open reason="favourite" onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: GATE_TITLES.favourite })).toBeTruthy();
  });
  it('shows the five-bar mark at 40 px', () => {
    const { container } = render(<SignInGate open onClose={() => {}} />);
    const eq = container.querySelector('.eq');
    expect(eq?.getAttribute('data-size')).toBe('40');
    expect(eq?.querySelectorAll(':scope > span')).toHaveLength(5);
  });
  it('Keep browsing closes it', () => {
    const onClose = vi.fn();
    render(<SignInGate open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep browsing' }));
    expect(onClose).toHaveBeenCalled();
  });
  it('has no exclamation marks in its copy', () => {
    const { container } = render(<SignInGate open onClose={() => {}} />);
    expect(container.textContent).not.toContain('!');
  });
});
