/**
 * Service to interact with the Google Calendar API using the OAuth access token.
 */

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

/**
 * Fetches calendar events for today from the primary calendar to calculate busy/free slots.
 */
export async function fetchTodayEvents(accessToken: string): Promise<CalendarEvent[]> {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startOfDay)}&timeMax=${encodeURIComponent(endOfDay)}&singleEvents=true&orderBy=startTime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Google Calendar API Error: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error("Failed to fetch Google Calendar events:", error);
    throw error;
  }
}

/**
 * Adds an event to the primary Google Calendar for an AI scheduled time block.
 */
export async function addEventToCalendar(
  accessToken: string,
  title: string,
  description: string,
  startTimeIso: string,
  durationMinutes: number
): Promise<string | null> {
  try {
    const start = new Date(startTimeIso);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const event = {
      summary: `🎯 ${title}`,
      description: `${description}\n\n[Scheduled by Kairos AI]`,
      start: {
        dateTime: start.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      reminders: {
        useDefault: true
      }
    };

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Google Calendar Add Event Error: ${res.status} - ${errorText}`);
    }

    const createdEvent = await res.json();
    return createdEvent.id || null;
  } catch (error) {
    console.error("Failed to add calendar event:", error);
    alert("Could not add event to Google Calendar. Please check your authorization or try again.");
    return null;
  }
}

/**
 * Analyzes today's events to construct free slots representing time ranges.
 * If no events are scheduled, the whole day (09:00 - 21:00) is considered free.
 */
export function calculateFreeSlots(events: CalendarEvent[]) {
  // Let's model core working day from 08:00 to 22:00
  const slots: { start: string; end: string }[] = [];
  const workStart = new Date();
  workStart.setHours(8, 0, 0, 0);

  const workEnd = new Date();
  workEnd.setHours(22, 0, 0, 0);

  let currentStart = new Date(workStart);

  // Filter for valid today events within working hours
  const todayBusy = events
    .map(e => {
      const start = new Date(e.start.dateTime || e.start.date || "");
      const end = new Date(e.end.dateTime || e.end.date || "");
      return { start, end };
    })
    .filter(e => e.start < workEnd && e.end > workStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const busy of todayBusy) {
    if (busy.start > currentStart) {
      // Free slot between currentStart and busy.start
      const diffMs = busy.start.getTime() - currentStart.getTime();
      if (diffMs >= 30 * 60000) { // minimum 30 min slots
        slots.push({
          start: currentStart.toTimeString().substring(0, 5),
          end: busy.start.toTimeString().substring(0, 5)
        });
      }
    }
    if (busy.end > currentStart) {
      currentStart = new Date(busy.end);
    }
  }

  if (currentStart < workEnd) {
    const diffMs = workEnd.getTime() - currentStart.getTime();
    if (diffMs >= 30 * 60000) {
      slots.push({
        start: currentStart.toTimeString().substring(0, 5),
        end: workEnd.toTimeString().substring(0, 5)
      });
    }
  }

  return slots;
}
