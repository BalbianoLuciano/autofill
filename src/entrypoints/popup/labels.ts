/** Nombres en castellano de cada clave, y como se agrupan en el formulario. */

import type { FieldKey } from '../../core/fields';
import type { Currency, Lang, Period, RegionCode, SalaryBasis, SkipReason } from '../../types';

export const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  fullName: 'Nombre completo',
  pronouns: 'Pronombres',
  email: 'Email',
  phone: 'Teléfono',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  otherUrl: 'Otro enlace',
  city: 'Ciudad',
  country: 'País',
  address: 'Dirección',
  postalCode: 'Código postal',
  currentTitle: 'Puesto actual',
  currentCompany: 'Empresa actual',
  yearsExperience: 'Años de experiencia',
  salaryExpectation: 'Pretensión salarial',
  currentSalary: 'Salario actual',
  noticePeriod: 'Disponibilidad / preaviso',
  startDate: 'Fecha de inicio',
  workAuthorization: 'Dónde podés trabajar',
  requiresSponsorship: 'Requiere patrocinio de visa',
  visaStatus: 'Situación migratoria',
  workModality: 'Modalidad preferida',
  willingToRelocate: 'Dispuesto a mudarte',
  nationalId: 'Documento',
  dateOfBirth: 'Fecha de nacimiento',
  englishLevel: 'Nivel de inglés',
  otherLanguages: 'Otros idiomas',
  education: 'Educación',
  coverLetter: 'Carta de presentación',
  howDidYouHear: 'Cómo nos conociste',
  referralName: 'Quién te refirió',
  gender: 'Género',
  ethnicity: 'Etnia',
  veteranStatus: 'Estado de veterano',
  disabilityStatus: 'Discapacidad',
};

/** Aclaraciones para los campos donde el formato importa. */
export const FIELD_HINTS: Partial<Record<FieldKey, string>> = {
  fullName: 'Como lo pide un formulario: nombre y apellido juntos',
  workAuthorization: 'Se usa para contestar «¿podés trabajar en X?» por sí o por no',
  requiresSponsorship: 'Si marcaste arriba dónde podés trabajar, se deduce solo',
  salaryExpectation: 'Se convierte sola entre hora, mes y año. Entre monedas, y entre bruto y neto, no.',
  yearsExperience: 'Solo el número',
  otherLanguages: 'Aparte del inglés',
};

export interface Group {
  title: string;
  note?: string;
  keys: FieldKey[];
}

export const GROUPS: Group[] = [
  {
    title: 'Identidad',
    keys: ['firstName', 'lastName', 'fullName', 'pronouns', 'email', 'phone'],
  },
  {
    title: 'Enlaces',
    keys: ['linkedin', 'github', 'portfolio', 'otherUrl'],
  },
  {
    title: 'Ubicación',
    keys: ['city', 'country', 'postalCode', 'address'],
  },
  {
    title: 'Trabajo',
    keys: [
      'currentTitle', 'currentCompany', 'yearsExperience',
      'noticePeriod', 'startDate', 'workModality', 'willingToRelocate',
    ],
  },
  {
    title: 'Idiomas y formación',
    keys: ['englishLevel', 'otherLanguages', 'education'],
  },
  {
    title: 'Cómo llegaste',
    keys: ['howDidYouHear', 'referralName'],
  },
  {
    title: 'Sensibles',
    note: 'Nunca se rellenan solos. Se resaltan en naranja y el popup te dice qué corresponde.',
    keys: [
      'salaryExpectation', 'currentSalary', 'workAuthorization',
      'requiresSponsorship', 'visaStatus', 'nationalId', 'dateOfBirth', 'coverLetter',
    ],
  },
  {
    title: 'EEO · formularios de EE.UU.',
    note: 'Opcionales en el formulario y opcionales acá. También son sensibles.',
    keys: ['gender', 'ethnicity', 'veteranStatus', 'disabilityStatus'],
  },
];

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  sensitive: 'Sensible, lo completás vos',
  'no-value': 'No hay dato en el perfil',
  'no-currency': 'Pide una moneda que no cargaste',
  'no-basis': 'Pide bruto o neto, y solo tenés el otro',
  'unlisted-skill': 'Pregunta por una tecnología que no tenés cargada',
  'no-option': 'Ninguna opción coincidió',
  'needs-answer': 'Pregunta abierta, la contestás vos',
  'already-filled': 'Ya tenía contenido',
  unmapped: 'Sin reconocer',
};

export const REGION_LABELS: Record<RegionCode, string> = {
  AR: 'Argentina',
  ES: 'España',
  EU: 'Unión Europea',
  US: 'Estados Unidos',
  UK: 'Reino Unido',
  CA: 'Canadá',
  MX: 'México',
  BR: 'Brasil',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD',
  ARS: 'ARS',
  EUR: 'EUR',
};

export const BASIS_LABELS: Record<SalaryBasis, string> = {
  gross: 'bruto',
  net: 'neto',
};

export const PERIOD_LABELS: Record<Period, string> = {
  hour: 'por hora',
  month: 'por mes',
  year: 'por año',
};

export const LANG_LABELS: Record<Lang | 'auto', string> = {
  auto: 'Detectar de la página',
  es: 'Siempre español',
  en: 'Siempre inglés',
};
