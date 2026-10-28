export interface Employee {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  devices: { id: string; model: string | null; pairedAt: string }[];
  _count: { faces: number };
}

export interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface FaceRef {
  id: string;
  createdAt: string;
}

export interface Pairing {
  code: string;
  expiresAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  kind: 'IN' | 'OUT';
  at: string;
  lat: number;
  lng: number;
  accuracyM: number;
  mock: boolean;
  distanceM: number | null;
  faceScore: number | null;
  signatureOk: boolean;
  photoOk: boolean | null;
  locationOk: boolean | null;
  faceOk: boolean | null;
  result: 'ACCEPTED' | 'REJECTED';
  reason: string | null;
  employee: { code: string; name: string };
}

export interface ReportDay {
  day: string;
  firstIn: string | null;
  lastOut: string | null;
  rejected: number;
}

export interface Report {
  month: string;
  timezone: string;
  daysInMonth: number;
  employees: { id: string; code: string; name: string; present: number; days: ReportDay[] }[];
}
