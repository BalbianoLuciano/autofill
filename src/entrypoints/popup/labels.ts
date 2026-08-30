/** Nombres en castellano de cada clave, y como se agrupan en el formulario. */

import type { FieldKey } from '../../core/fields';

export const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  fullName: 'Nombre completo',
  email: 'Email',
  phone: 'Telefono',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  otherUrl: 'Otro enlace',
  city: 'Ciudad',
  country: 'Pais',
  address: 'Direccion',
  postalCode: 'Codigo postal',
  currentTitle: 'Puesto actual',
  currentCompany: 'Empresa actual',
  yearsExperience: 'Anos de experiencia',
  salaryExpectation: 'Pretension salarial',
  noticePeriod: 'Preaviso / disponibilidad',
  startDate: 'Fecha de inicio',
  workAuthorization: 'Permiso de trabajo',
  requiresSponsorship: 'Requiere patrocinio de visa',
  nationalId: 'Documento',
  englishLevel: 'Nivel de ingles',
  education: 'Educacion',
  coverLetter: 'Carta de presentacion',
  howDidYouHear: 'Como nos conociste',
};

export const GROUPS: { title: string; keys: FieldKey[] }[] = [
  {
    title: 'Identidad',
    keys: ['firstName', 'lastName', 'fullName', 'email', 'phone'],
  },
  {
    title: 'Enlaces',
    keys: ['linkedin', 'github', 'portfolio', 'otherUrl'],
  },
  {
    title: 'Ubicacion',
    keys: ['city', 'country', 'postalCode', 'address'],
  },
  {
    title: 'Trabajo',
    keys: ['currentTitle', 'currentCompany', 'yearsExperience', 'noticePeriod', 'startDate'],
  },
  {
    title: 'Perfil',
    keys: ['englishLevel', 'education', 'howDidYouHear'],
  },
  {
    title: 'Sensibles',
    keys: [
      'salaryExpectation',
      'workAuthorization',
      'requiresSponsorship',
      'nationalId',
      'coverLetter',
    ],
  },
];

export const SKIP_REASON_LABELS = {
  sensitive: 'Sensible, lo completas vos',
  'no-value': 'No hay dato en el perfil',
  'no-option': 'Ninguna opcion coincidio',
  'already-filled': 'Ya tenia contenido',
  unmapped: 'Sin reconocer',
} as const;
