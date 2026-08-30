/**
 * Diccionario de campos.
 *
 * Cada entrada es un dato del perfil y todas las formas en que un formulario
 * puede pedirlo. El matcher normaliza lo que encuentra en la pagina (label,
 * name, id, placeholder, aria-label, autocomplete) y lo busca aca.
 *
 * `autocomplete` va primero y aparte porque es el unico atributo estandar:
 * cuando el formulario lo declara bien, no hace falta adivinar nada.
 */

export type FieldKey =
  | 'firstName' | 'lastName' | 'fullName'
  | 'email' | 'phone'
  | 'linkedin' | 'github' | 'portfolio' | 'otherUrl'
  | 'city' | 'country' | 'address' | 'postalCode'
  | 'currentTitle' | 'currentCompany' | 'yearsExperience'
  | 'salaryExpectation' | 'noticePeriod' | 'startDate'
  | 'workAuthorization' | 'requiresSponsorship' | 'nationalId'
  | 'englishLevel' | 'education' | 'coverLetter' | 'howDidYouHear';

export interface FieldDef {
  key: FieldKey;
  /** Valores del atributo `autocomplete` que corresponden a este campo. */
  autocomplete?: string[];
  /** Fragmentos que se buscan en label, name, id, placeholder y aria-label. */
  aliases: string[];
  /** true = no se rellena solo; se marca para que la persona confirme. */
  sensitive?: boolean;
  multiline?: boolean;
}

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
    key: 'email',
    autocomplete: ['email'],
    aliases: [
      'email', 'e-mail', 'email address', 'e-mail address', 'mail',
      'your email', 'contact email', 'work email', 'personal email',
      'correo', 'correo electronico', 'correo electrónico', 'e-mail', 'mail',
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
    autocomplete: ['address-level2'],
    aliases: [
      'city', 'town', 'current city', 'city of residence', 'location', 'based in',
      'where are you based', 'ciudad', 'localidad', 'ciudad actual',
      'ciudad de residencia', 'ubicacion', 'ubicación',
    ],
  },
  {
    key: 'country',
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
    aliases: [
      'years of experience', 'years experience', 'yoe', 'total experience',
      'how many years', 'years of relevant experience', 'experience years',
      'anos de experiencia', 'años de experiencia', 'experiencia',
      'anios de experiencia',
    ],
  },
  {
    key: 'salaryExpectation',
    aliases: [
      'salary', 'salary expectation', 'expected salary', 'desired salary',
      'compensation', 'expected compensation', 'salary range', 'rate',
      'hourly rate', 'desired compensation',
      'salario', 'pretension salarial', 'pretensión salarial',
      'expectativa salarial', 'remuneracion', 'remuneración', 'sueldo',
    ],
    sensitive: true,
  },
  {
    key: 'noticePeriod',
    aliases: [
      'notice period', 'availability', 'when can you start', 'available from',
      'earliest start date', 'disponibilidad', 'preaviso',
      'cuando podes empezar', 'cuándo podés empezar', 'fecha de inicio',
    ],
  },
  {
    key: 'startDate',
    aliases: [
      'start date', 'preferred start date', 'available start date',
      'fecha de inicio', 'fecha de disponibilidad',
    ],
  },
  {
    key: 'workAuthorization',
    aliases: [
      'work authorization', 'work authorisation', 'authorized to work',
      'legally authorized', 'right to work', 'work permit', 'work eligibility',
      'eu work permit', 'permiso de trabajo', 'autorizacion de trabajo',
      'autorización de trabajo', 'permiso de residencia',
    ],
    sensitive: true,
  },
  {
    key: 'requiresSponsorship',
    aliases: [
      'sponsorship', 'require sponsorship', 'visa sponsorship', 'need sponsorship',
      'visa status', 'requiere patrocinio', 'necesita visa',
    ],
    sensitive: true,
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
    key: 'englishLevel',
    aliases: [
      'english level', 'english proficiency', 'level of english',
      'language level', 'do you speak english', 'nivel de ingles',
      'nivel de inglés', 'idiomas', 'languages',
    ],
  },
  {
    key: 'education',
    aliases: [
      'education', 'highest degree', 'degree', 'university', 'school',
      'qualification', 'educacion', 'educación', 'formacion', 'formación',
      'titulo', 'título', 'universidad', 'estudios',
    ],
  },
  {
    key: 'coverLetter',
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
    aliases: [
      'how did you hear', 'how did you find', 'referral source', 'source',
      'where did you hear', 'como nos conociste', 'cómo nos conociste',
      'como te enteraste', 'cómo te enteraste',
    ],
  },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
