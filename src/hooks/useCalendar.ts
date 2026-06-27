import { useState, useCallback } from "react";
import { 
  fetchTodayEvents, 
  addEventToCalendar, 
  calculateFreeSlots, 
  CalendarEvent 
} from "../services/calendarService";

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [freeSlots, setFreeSlots] = useState<{ start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const loadCalendar = useCallback(async (accessToken: string) => {
    if (!accessToken) return;
    setLoading(true);
    setCalendarError(null);
    try {
      const todayEvents = await fetchTodayEvents(accessToken);
      setEvents(todayEvents);
      const slots = calculateFreeSlots(todayEvents);
      setFreeSlots(slots);
    } catch (err: any) {
      console.error("Failed to load Google Calendar events in hook:", err);
      const errMsg = err?.message || String(err);
      setCalendarError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEvent = useCallback(async (
    accessToken: string,
    title: string,
    description: string,
    startTimeIso: string,
    durationMinutes: number
  ) => {
    if (!accessToken) return null;
    try {
      const eventId = await addEventToCalendar(
        accessToken,
        title,
        description,
        startTimeIso,
        durationMinutes
      );
      // Reload calendar to reflect the new event
      await loadCalendar(accessToken);
      return eventId;
    } catch (err) {
      console.error("Failed to create Google Calendar event in hook:", err);
      return null;
    }
  }, [loadCalendar]);

  return {
    events,
    freeSlots,
    loading,
    calendarError,
    loadCalendar,
    createEvent
  };
}
