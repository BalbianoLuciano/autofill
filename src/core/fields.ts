/**
 * Diccionario de campos.
 *
 * Cada entrada es un dato del perfil y todas las formas en que un formulario
 * puede pedirlo. El matcher normaliza lo que encuentra en la pagina (label,
 * name, id, placeholder, aria-label, autocomplete) y lo busca aca.
 *
 * `autocomplete` va primero y aparte porque es el unico atributo estandar:
 * cuando el formulario lo declara bien, no hace falta adivinar nada.
 *
 * Cada campo declara ademas de que **tipo** es, y eso decide como se guarda y
 * como se resuelve:
 *
 *   text     texto libre. Si es `localized`, admite variante en ingles.
 *   choice   lista cerrada. Se guarda el codigo; la etiqueta sale en el idioma
 *            de la pagina. Es lo que permite contestar un select o un radio.
 *   salary   monto + moneda + periodo. Se resuelve contra lo que pide el label.
 *   regions  donde la persona puede trabajar, para contestar por si o por no.
 */

export type FieldKey =
  | 'firstName' | 'lastName' | 'fullName' | 'pronouns'
  | 'email' | 'phone'
  | 'linkedin' | 'github' | 'portfolio' | 'otherUrl'
  | 'city' | 'country' | 'address' | 'postalCode'
  | 'currentTitle' | 'currentCompany' | 'yearsExperience'
  | 'salaryExpectation' | 'currentSalary'
  | 'noticePeriod' | 'startDate'
  | 'workAuthorization' | 'requiresSponsorship' | 'visaStatus'
  | 'workModality' | 'willingToRelocate'
  | 'nationalId' | 'dateOfBirth'
  | 'englishLevel' | 'otherLanguages' | 'education'
  | 'coverLetter' | 'howDidYouHear' | 'referralName'
  | 'gender' | 'ethnicity' | 'veteranStatus' | 'disabilityStatus';

export type FieldKind = 'text' | 'choice' | 'salary' | 'regions' | 'skills';

export interface ChoiceOption {
  code: string;
  es: string;
  en: string;
  /**
   * Dias desde hoy. Un `<input type="date">` descarta en silencio cualquier
   * cosa que no sea YYYY-MM-DD, asi que "Inmediata" ahi no sirve: hay que
   * darle la fecha de verdad.
   */
  offsetDays?: number;
  /**
   * Como puede aparecer escrita esta opcion en el select del formulario.
   * Se usa para elegir la opcion correcta cuando el texto no coincide exacto.
   */
  match?: string[];
}

export interface FieldDef {
  key: FieldKey;
  /** Default: 'text'. */
  kind?: FieldKind;
  /** Solo para 'text': admite una variante en ingles ademas de la castellana. */
  localized?: boolean;
  /** Solo para 'choice'. */
  options?: ChoiceOption[];
  /** Valores del atributo `autocomplete` que corresponden a este campo. */
  autocomplete?: string[];
  /** Fragmentos que se buscan en label, name, id, placeholder y aria-label. */
  aliases: string[];
  /** true = no se rellena solo; se marca para que la persona confirme. */
  sensitive?: boolean;
  multiline?: boolean;
}

/* ------------------------- opciones reutilizables ------------------------- */

const YES_NO: ChoiceOption[] = [
  { code: 'yes', es: 'Sí', en: 'Yes', match: ['si', 'sí', 'yes', 'y', 'true', 'afirmativo'] },
  { code: 'no', es: 'No', en: 'No', match: ['no', 'n', 'false', 'negativo'] },
];

const PREFER_NOT = {
  code: 'prefer_not',
  es: 'Prefiero no responder',
  en: 'I prefer not to say',
  match: [
    'prefer not', 'decline', 'do not wish', "don't wish", 'not specified',
    'prefiero no', 'no responder', 'sin especificar',
  ],
};

export const FIELDS: FieldDef[] = [
  {
    key: 'firstName',
    autocomplete: ['given-name'],
    aliases: [
      'first name', 'firstname', 'first_name', 'fname', 'given name', 'givenname',
      'forename', 'legal first name', 'preferred first name',
      'nombre', 'nombres', 'primer nombre', 'nombre de pila', 'tu nombre',
      'prenom', 'prénom', 'vorname', 'nome',
    ],
  },
  {
    key: 'lastName',
    autocomplete: ['family-name'],
    aliases: [
      'last name', 'lastname', 'last_name', 'lname', 'surname', 'family name',
      'familyname', 'legal last name', 'second name',
      'apellido', 'apellidos', 'primer apellido', 'segundo apellido',
      'nom de famille', 'nachname', 'sobrenome',
    ],
  },
  {
    key: 'fullName',
    autocomplete: ['name'],
    aliases: [
      'full name', 'fullname', 'full_name', 'name', 'your name', 'applicant name',
      'candidate name', 'legal name', 'complete name', 'nombre completo',
      'nombre y apellido', 'nombre y apellidos', 'nome completo',
    ],
  },
  {
    key: 'pronouns',
    kind: 'choice',
    options: [
      { code: 'he', es: 'Él', en: 'He/Him', match: ['he', 'him', 'he/him', 'el', 'él', 'masculino'] },
      { code: 'she', es: 'Ella', en: 'She/Her', match: ['she', 'her', 'she/her', 'ella', 'femenino'] },
      { code: 'they', es: 'Elle', en: 'They/Them', match: ['they', 'them', 'they/them', 'elle', 'neutro'] },
      PREFER_NOT,
    ],
    aliases: ['pronouns', 'preferred pronouns', 'pronombres', 'tus pronombres'],
  },
  {
    key: 'email',
    autocomplete: ['email'],
    aliases: [
      'email', 'e-mail', 'email address', 'e-mail address', 'mail',
      'your email', 'contact email', 'work email', 'personal email',
      'correo', 'correo electronico', 'correo electrónico',
    ],
  },
  {
    key: 'phone',
    autocomplete: ['tel', 'tel-national'],
    aliases: [
      'phone', 'phone number', 'telephone', 'mobile', 'mobile number', 'cell',
      'cellphone', 'contact number', 'whatsapp',
      'telefono', 'teléfono', 'celular', 'movil', 'móvil', 'numero de telefono',
    ],
  },
  {
    key: 'linkedin',
    autocomplete: ['url'],
    aliases: [
      'linkedin', 'linked in', 'linkedin url', 'linkedin profile',
      'linkedin.com', 'perfil de linkedin',
    ],
  },
  {
    key: 'github',
    autocomplete: ['url'],
    aliases: [
      'github', 'git hub', 'github url', 'github profile', 'github.com',
      'gitlab', 'repository', 'repositorio', 'perfil de github',
    ],
  },
  {
    key: 'portfolio',
    autocomplete: ['url'],
    aliases: [
      'portfolio', 'portfolio url', 'website', 'personal website', 'web site',
      'personal site', 'homepage', 'your website', 'portafolio', 'sitio web',
      'pagina web', 'página web', 'web personal',
    ],
  },
  {
    key: 'otherUrl',
    aliases: [
      'other url', 'other website', 'additional link', 'other profile',
      'twitter', 'x.com', 'behance', 'dribbble', 'stack overflow', 'stackoverflow',
      'otro enlace', 'otro sitio',
    ],
  },
  {
    key: 'city',
    kind: 'text',
    localized: true,
    autocomplete: ['address-level2'],
    aliases: [
      'city', 'town', 'current city', 'city of residence', 'location', 'based in',
      'where are you based', 'ciudad', 'localidad', 'ciudad actual',
      'ciudad de residencia', 'ubicacion', 'ubicación',
    ],
  },
  {
    key: 'country',
    kind: 'text',
    localized: true,
    autocomplete: ['country', 'country-name'],
    aliases: [
      'country', 'country of residence', 'nation', 'pais', 'país',
      'pais de residencia', 'nacionalidad', 'nationality',
    ],
  },
  {
    key: 'address',
    autocomplete: ['street-address', 'address-line1'],
    aliases: [
      'address', 'street address', 'street', 'address line 1',
      'direccion', 'dirección', 'domicilio', 'calle',
    ],
    sensitive: true,
  },
  {
    key: 'postalCode',
    autocomplete: ['postal-code'],
    aliases: [
      'postal code', 'zip', 'zip code', 'postcode',
      'codigo postal', 'código postal', 'cp',
    ],
  },
  {
    key: 'currentTitle',
    kind: 'text',
    localized: true,
    autocomplete: ['organization-title'],
    aliases: [
      'current title', 'job title', 'current position', 'current role', 'title',
      'position', 'role', 'occupation',
      'puesto', 'puesto actual', 'cargo', 'cargo actual', 'titulo del puesto',
    ],
  },
  {
    key: 'currentCompany',
    autocomplete: ['organization'],
    aliases: [
      'current company', 'company', 'employer', 'current employer', 'organization',
      'organisation', 'where do you work',
      'empresa', 'empresa actual', 'compania', 'compañía', 'empleador',
    ],
  },
  {
    key: 'yearsExperience',
    kind: 'skills',
    aliases: [
      'years of experience', 'years experience', 'yoe', 'total experience',
      'how many years', 'years of relevant experience', 'experience years',
      'anos de experiencia', 'años de experiencia', 'anios de experiencia',
      'cuantos anos de experiencia', 'anos de experiencia con',
      'years of experience with',
      // La forma corta, que es como los formularios de IT preguntan por cada
      // tecnologia: "¿Cuantos anios con React?", "Years with Kubernetes".
      'cuantos anos con', 'cuantos años con', 'anos con', 'años con',
      'anos usando', 'años usando', 'years with', 'how many years with',
      'years using',
    ],
  },
  {
    key: 'salaryExpectation',
    kind: 'salary',
    aliases: [
      'salary', 'salary expectation', 'expected salary', 'desired salary',
      'compensation', 'expected compensation', 'salary range', 'rate',
      'hourly rate', 'desired compensation', 'salary requirements',
      'expected annual salary', 'expected monthly salary',
      'salario', 'pretension salarial', 'pretensión salarial',
      'expectativa salarial', 'remuneracion', 'remuneración', 'sueldo',
      'sueldo pretendido', 'tarifa por hora',
    ],
    sensitive: true,
  },
  {
    key: 'currentSalary',
    kind: 'salary',
    aliases: [
      'current salary', 'current compensation', 'present salary',
      'salario actual', 'sueldo actual', 'remuneracion actual',
    ],
    sensitive: true,
  },
  {
    key: 'noticePeriod',
    kind: 'choice',
    options: [
      {
        code: 'immediate', es: 'Inmediata', en: 'Immediately',
        match: ['immediate', 'immediately', 'asap', 'right away', 'now', 'available now',
                'inmediata', 'inmediato', 'de inmediato', 'ya', 'disponible ahora'],
      },
      {
        code: '2weeks', es: '2 semanas', en: '2 weeks',
        match: ['2 weeks', 'two weeks', '15 days', 'dos semanas', '15 dias', 'quince dias'],
      },
      {
        code: '1month', es: '1 mes', en: '1 month',
        match: ['1 month', 'one month', '30 days', 'un mes', '30 dias', 'treinta dias'],
      },
      {
        code: '2months', es: '2 meses', en: '2 months',
        match: ['2 months', 'two months', '60 days', 'dos meses', '60 dias'],
      },
      {
        code: '3months', es: '3 meses', en: '3 months',
        match: ['3 months', 'three months', '90 days', 'tres meses', '90 dias'],
      },
      {
        code: 'negotiable', es: 'A convenir', en: 'Negotiable',
        match: ['negotiable', 'flexible', 'to be discussed', 'a convenir', 'negociable'],
      },
    ],
    aliases: [
      'notice period', 'availability', 'when can you start', 'available from',
      'earliest start date', 'how soon can you start',
      'disponibilidad', 'preaviso', 'cuando podes empezar', 'cuándo podés empezar',
    ],
  },
  {
    key: 'startDate',
    kind: 'choice',
    options: [
      {
        code: 'today', es: 'Inmediata', en: 'Immediately', offsetDays: 0,
        match: ['immediate', 'immediately', 'asap', 'now', 'today',
                'inmediata', 'inmediato', 'ya', 'hoy'],
      },
      {
        code: '1week', es: 'En una semana', en: 'In a week', offsetDays: 7,
        match: ['1 week', 'one week', 'una semana'],
      },
      {
        code: '2weeks', es: 'En dos semanas', en: 'In two weeks', offsetDays: 14,
        match: ['2 weeks', 'two weeks', 'dos semanas', '15 days', '15 dias'],
      },
      {
        code: '1month', es: 'En un mes', en: 'In a month', offsetDays: 30,
        match: ['1 month', 'one month', 'un mes', '30 days', '30 dias'],
      },
    ],
    aliases: [
      'start date', 'preferred start date', 'available start date',
      'when can you start working', 'earliest availability',
      'fecha de inicio', 'fecha de disponibilidad', 'fecha de incorporacion',
    ],
  },
  {
    key: 'workAuthorization',
    kind: 'regions',
    aliases: [
      'work authorization', 'work authorisation', 'authorized to work',
      'authorised to work', 'legally authorized', 'legally authorised',
      'right to work', 'work permit', 'work eligibility', 'eligible to work',
      'eu work permit',
      'permiso de trabajo', 'autorizacion de trabajo', 'autorización de trabajo',
      'permiso de residencia', 'autorizado a trabajar',
    ],
    sensitive: true,
  },
  {
    key: 'requiresSponsorship',
    kind: 'choice',
    options: YES_NO,
    aliases: [
      'sponsorship', 'require sponsorship', 'visa sponsorship', 'need sponsorship',
      'will you require sponsorship', 'requiere patrocinio', 'necesita visa',
      'patrocinio de visa',
    ],
    sensitive: true,
  },
  {
    key: 'visaStatus',
    kind: 'text',
    localized: true,
    aliases: [
      'visa status', 'current visa', 'immigration status', 'visa type',
      'estado migratorio', 'situacion migratoria', 'tipo de visa',
    ],
    sensitive: true,
  },
  {
    key: 'workModality',
    kind: 'choice',
    options: [
      {
        code: 'remote', es: 'Remoto', en: 'Remote',
        match: ['remote', 'fully remote', 'work from home', 'wfh', 'remoto', 'teletrabajo', 'a distancia'],
      },
      {
        code: 'hybrid', es: 'Híbrido', en: 'Hybrid',
        match: ['hybrid', 'flexible', 'partially remote', 'hibrido', 'híbrido', 'mixto'],
      },
      {
        code: 'onsite', es: 'Presencial', en: 'On-site',
        match: ['onsite', 'on site', 'on-site', 'in office', 'in-office', 'presencial', 'oficina'],
      },
      {
        code: 'any', es: 'Cualquiera', en: 'No preference',
        match: ['any', 'no preference', 'open', 'cualquiera', 'indistinto', 'sin preferencia'],
      },
    ],
    aliases: [
      'work modality', 'work arrangement', 'work preference', 'work setup',
      'remote or onsite', 'work location preference',
      'modalidad', 'modalidad de trabajo', 'presencial o remoto',
    ],
  },
  {
    key: 'willingToRelocate',
    kind: 'choice',
    options: [
      ...YES_NO,
      {
        code: 'maybe', es: 'Depende', en: 'Open to discuss',
        match: ['maybe', 'depends', 'open to discuss', 'negotiable', 'depende', 'a convenir'],
      },
    ],
    aliases: [
      'willing to relocate', 'open to relocation', 'relocate', 'relocation',
      'would you relocate',
      'dispuesto a mudarse', 'reubicacion', 'reubicación', 'te mudarias',
    ],
  },
  {
    key: 'nationalId',
    aliases: [
      'national id', 'ssn', 'social security', 'tax id', 'passport number',
      'dni', 'nie', 'nif', 'cuil', 'cuit', 'documento', 'pasaporte',
    ],
    sensitive: true,
  },
  {
    key: 'dateOfBirth',
    autocomplete: ['bday'],
    aliases: [
      'date of birth', 'birth date', 'birthday', 'dob',
      'fecha de nacimiento', 'nacimiento',
    ],
    sensitive: true,
  },
  {
    key: 'englishLevel',
    kind: 'choice',
    options: [
      { code: 'a2', es: 'A2 - Básico', en: 'A2 - Elementary', match: ['a2', 'basic', 'elementary', 'basico', 'básico'] },
      { code: 'b1', es: 'B1 - Intermedio', en: 'B1 - Intermediate', match: ['b1', 'intermediate', 'intermedio', 'limited working', 'medio'] },
      { code: 'b2', es: 'B2 - Intermedio alto', en: 'B2 - Upper intermediate', match: ['b2', 'upper intermediate', 'intermedio alto', 'professional working', 'intermedio avanzado', 'pre avanzado'] },
      { code: 'c1', es: 'C1 - Avanzado', en: 'C1 - Advanced', match: ['c1', 'advanced', 'avanzado', 'full professional', 'fluent', 'fluido', 'conversacional'] },
      { code: 'c2', es: 'C2 - Bilingüe', en: 'C2 - Proficient', match: ['c2', 'proficient', 'bilingual', 'bilingue', 'bilingüe', 'near native'] },
      { code: 'native', es: 'Nativo', en: 'Native', match: ['native', 'nativo', 'mother tongue', 'lengua materna'] },
    ],
    aliases: [
      'english level', 'english proficiency', 'level of english', 'english',
      'language level', 'do you speak english', 'nivel de ingles',
      'nivel de inglés', 'ingles', 'inglés',
    ],
  },
  {
    key: 'otherLanguages',
    kind: 'text',
    localized: true,
    aliases: [
      'other languages', 'languages spoken', 'languages', 'spoken languages',
      'idiomas', 'otros idiomas', 'que idiomas hablas',
    ],
  },
  {
    key: 'education',
    kind: 'text',
    localized: true,
    aliases: [
      'education', 'highest degree', 'degree', 'university', 'school',
      'qualification', 'educacion', 'educación', 'formacion', 'formación',
      'titulo', 'título', 'universidad', 'estudios',
    ],
  },
  {
    key: 'coverLetter',
    kind: 'text',
    localized: true,
    multiline: true,
    aliases: [
      'cover letter', 'why do you want', 'why are you interested', 'tell us about',
      'message', 'additional information', 'anything else', 'motivation',
      'carta de presentacion', 'carta de presentación', 'mensaje',
      'por que quieres', 'por qué querés', 'cuentanos', 'cuéntanos',
    ],
    sensitive: true,
  },
  {
    key: 'howDidYouHear',
    kind: 'text',
    localized: true,
    aliases: [
      'how did you hear', 'how did you find', 'referral source', 'source',
      'where did you hear', 'como nos conociste', 'cómo nos conociste',
      'como te enteraste', 'cómo te enteraste',
    ],
  },
  {
    key: 'referralName',
    aliases: [
      'referral name', 'who referred you', 'referred by', 'referrer',
      'quien te refirio', 'quién te refirió', 'nombre del referente',
    ],
  },

  /* --------------------------- EEO (formularios de EE.UU.) ---------------------------
   * Se piden en casi toda aplicacion estadounidense y siempre son opcionales.
   * Van como sensibles: nunca se rellenan solos.
   * ---------------------------------------------------------------------------------- */
  {
    key: 'gender',
    kind: 'choice',
    options: [
      { code: 'male', es: 'Masculino', en: 'Male', match: ['male', 'man', 'masculino', 'hombre', 'varon'] },
      { code: 'female', es: 'Femenino', en: 'Female', match: ['female', 'woman', 'femenino', 'mujer'] },
      { code: 'non_binary', es: 'No binario', en: 'Non-binary', match: ['non binary', 'nonbinary', 'non-binary', 'no binario'] },
      PREFER_NOT,
    ],
    aliases: ['gender', 'gender identity', 'genero', 'género', 'identidad de genero'],
    sensitive: true,
  },
  {
    key: 'ethnicity',
    kind: 'choice',
    options: [
      { code: 'hispanic', es: 'Hispano o latino', en: 'Hispanic or Latino', match: ['hispanic', 'latino', 'latinx', 'hispano'] },
      { code: 'white', es: 'Blanco', en: 'White', match: ['white', 'caucasian', 'blanco'] },
      { code: 'black', es: 'Negro o afrodescendiente', en: 'Black or African American', match: ['black', 'african american', 'negro'] },
      { code: 'asian', es: 'Asiático', en: 'Asian', match: ['asian', 'asiatico', 'asiático'] },
      { code: 'two_or_more', es: 'Dos o más razas', en: 'Two or more races', match: ['two or more', 'multiracial', 'dos o mas'] },
      PREFER_NOT,
    ],
    aliases: [
      'ethnicity', 'race', 'racial', 'hispanic or latino', 'race ethnicity',
      'etnia', 'origen etnico', 'origen étnico',
    ],
    sensitive: true,
  },
  {
    key: 'veteranStatus',
    kind: 'choice',
    options: [
      { code: 'not_veteran', es: 'No soy veterano', en: 'I am not a protected veteran', match: ['not a protected veteran', 'not a veteran', 'no soy veterano'] },
      { code: 'veteran', es: 'Soy veterano', en: 'I identify as a protected veteran', match: ['i identify as', 'protected veteran', 'soy veterano'] },
      PREFER_NOT,
    ],
    aliases: [
      'veteran status', 'protected veteran', 'military service',
      'estado de veterano', 'servicio militar',
    ],
    sensitive: true,
  },
  {
    key: 'disabilityStatus',
    kind: 'choice',
    options: [
      { code: 'no', es: 'No tengo discapacidad', en: 'No, I do not have a disability', match: ['no i do not have', 'no, i do not', 'no disability', 'no tengo'] },
      { code: 'yes', es: 'Sí, tengo discapacidad', en: 'Yes, I have a disability', match: ['yes i have', 'yes, i have', 'si tengo', 'sí tengo'] },
      PREFER_NOT,
    ],
    aliases: [
      'disability status', 'disability', 'disabilities',
      'discapacidad', 'situacion de discapacidad',
    ],
    sensitive: true,
  },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** El tipo de un campo, con 'text' como default. */
export function kindOf(key: FieldKey): FieldKind {
  return FIELD_BY_KEY.get(key)?.kind ?? 'text';
}
