export interface TimezoneItem {
  value: string;
  label: string;
  cities: string;
  region: string;
}

export const TIMEZONE_LIST: TimezoneItem[] = [
  { value: 'Asia/Karachi', label: 'Pakistan Standard Time (PKT)', cities: 'Karachi, Islamabad, Lahore', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST)', cities: 'Dubai, Abu Dhabi, Muscat', region: 'Middle East' },
  { value: 'Asia/Riyadh', label: 'Arabia Standard Time (AST)', cities: 'Riyadh, Jeddah, Doha', region: 'Middle East' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)', cities: 'New Delhi, Mumbai, Bengaluru', region: 'Asia' },
  { value: 'Asia/Dhaka', label: 'Bangladesh Standard Time (BST)', cities: 'Dhaka, Chittagong', region: 'Asia' },
  { value: 'America/New_York', label: 'Eastern Time (ET - US & Canada)', cities: 'New York, Miami, Toronto', region: 'Americas' },
  { value: 'America/Chicago', label: 'Central Time (CT - US & Canada)', cities: 'Chicago, Dallas, Houston', region: 'Americas' },
  { value: 'America/Denver', label: 'Mountain Time (MT - US & Canada)', cities: 'Denver, Phoenix, Salt Lake', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT - US & Canada)', cities: 'Los Angeles, San Francisco, Seattle', region: 'Americas' },
  { value: 'Europe/London', label: 'London Time (GMT / BST)', cities: 'London, Manchester, Dublin', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)', cities: 'Paris, Berlin, Rome, Madrid', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Turkey Time (TRT)', cities: 'Istanbul, Ankara', region: 'Europe' },
  { value: 'Asia/Singapore', label: 'Singapore & Malaysia Time (SGT)', cities: 'Singapore, Kuala Lumpur', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong Time (HKT)', cities: 'Hong Kong, Beijing, Shanghai', region: 'Asia' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)', cities: 'Tokyo, Osaka, Seoul', region: 'Asia' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEST)', cities: 'Sydney, Melbourne, Brisbane', region: 'Oceania' },
  { value: 'Australia/Perth', label: 'Australian Western Time (AWST)', cities: 'Perth', region: 'Oceania' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time (NZST)', cities: 'Auckland, Wellington', region: 'Oceania' },
  { value: 'America/Sao_Paulo', label: 'Brasília Time (BRT)', cities: 'São Paulo, Rio de Janeiro', region: 'Americas' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)', cities: 'UTC Zero Offset', region: 'Global' }
];

export function getShortTimeForZone(timeZone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return '';
  }
}

export function getLiveTimeWithSeconds(timeZone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return '';
  }
}

export function getGmtOffset(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset'
    }).formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart?.value) return tzPart.value;
  } catch (e) {}

  // Fallback offset calculation
  try {
    const dateStr = date.toLocaleString('en-US', { timeZone });
    const localDate = new Date(dateStr);
    const diffMin = Math.round((localDate.getTime() - date.getTime()) / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(diffMin) / 60);
    const mins = Math.abs(diffMin) % 60;
    return `GMT${sign}${hours}${mins ? ':' + String(mins).padStart(2, '0') : ''}`;
  } catch (e) {
    return 'GMT';
  }
}

export function detectUserTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) {
      // Check if it exactly matches one of our known ones
      const exists = TIMEZONE_LIST.some(t => t.value === resolved);
      if (exists) return resolved;

      // Handle common aliases/fallbacks
      if (resolved.includes('Karachi') || resolved.includes('Islamabad') || resolved.includes('Pakistan')) return 'Asia/Karachi';
      if (resolved.includes('Dubai') || resolved.includes('Muscat')) return 'Asia/Dubai';
      if (resolved.includes('Calcutta') || resolved.includes('Kolkata')) return 'Asia/Kolkata';
      if (resolved.includes('London')) return 'Europe/London';
      if (resolved.includes('New_York')) return 'America/New_York';
      return resolved;
    }
  } catch (e) {}
  return 'Asia/Karachi';
}
