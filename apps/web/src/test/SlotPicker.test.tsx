import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotPicker } from '../components/SlotPicker';

const TZ = 'America/Argentina/Buenos_Aires';

function mockSlots(slots: string[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ slots }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPicker(onSelectSlot = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SlotPicker
        slug="estudio"
        serviceId="svc-1"
        timezone={TZ}
        bookingWindowDays={6}
        workingWeekdays={[0, 1, 2, 3, 4, 5, 6]}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
      />
    </QueryClientProvider>,
  );
  return onSelectSlot;
}

afterEach(() => vi.unstubAllGlobals());

describe('SlotPicker', () => {
  it('shows one button per day in the booking window', () => {
    mockSlots([]);
    renderPicker();
    const dayGroup = screen.getByRole('radiogroup', { name: 'Elegí un día' });
    expect(dayGroup.querySelectorAll('[role="radio"]')).toHaveLength(7); // today + 6 days
  });

  it('groups slots by part of the day and reports the chosen one', async () => {
    const today = DateTime.now().setZone(TZ).toISODate();
    const morning = DateTime.fromISO(`${today}T09:00`, { zone: TZ }).toUTC().toISO()!;
    const afternoon = DateTime.fromISO(`${today}T15:30`, { zone: TZ }).toUTC().toISO()!;
    const fetchMock = mockSlots([morning, afternoon]);
    const onSelect = renderPicker();

    expect(await screen.findByRole('radio', { name: '09:00' })).toBeInTheDocument();
    expect(screen.getByText('Mañana')).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toContain(
      '/api/professionals/estudio/slots?serviceId=svc-1',
    );

    await userEvent.click(screen.getByRole('radio', { name: '15:30' }));
    expect(onSelect).toHaveBeenCalledWith(afternoon);
  });

  it('explains when a day has no free slots', async () => {
    mockSlots([]);
    renderPicker();
    expect(await screen.findByText(/No quedan horarios disponibles/)).toBeInTheDocument();
  });
});
