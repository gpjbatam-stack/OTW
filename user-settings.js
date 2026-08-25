export const DEFAULT_USER_SETTINGS = Object.freeze({
  orderUpdates: true,
  tripReminder: true,
  serviceInfo: false,
  cabin: "Ekonomi",
  airport: "BTH",
});

function keyFor(userId) {
  return userId ? `letsgo_user_settings_${userId}` : "letsgo_user_settings_guest";
}

export function readUserSettings(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return { ...DEFAULT_USER_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function writeUserSettings(userId, settings) {
  const normalized = { ...DEFAULT_USER_SETTINGS, ...(settings || {}) };
  localStorage.setItem(keyFor(userId), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("letsgo:settings-changed", { detail: normalized }));
  return normalized;
}

export function notificationPreferenceGroup(notification) {
  const type = String(notification?.type || "").toLowerCase();

  if (["service_info", "service", "feature", "feature_update", "announcement", "news"].includes(type)) {
    return "serviceInfo";
  }

  if (["trip_reminder", "travel_reminder", "departure_reminder", "flight_reminder", "checkin_reminder"].includes(type)) {
    return "tripReminder";
  }

  return "orderUpdates";
}

export function isNotificationEnabled(notification, settings) {
  const prefs = { ...DEFAULT_USER_SETTINGS, ...(settings || {}) };
  return Boolean(prefs[notificationPreferenceGroup(notification)]);
}
