import { Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// Rango del reporte, ambos días incluidos, en la zona horaria del gym.
export class ReportQueryDto {
  @Matches(YMD, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe tener el formato YYYY-MM-DD' })
  to!: string;
}
