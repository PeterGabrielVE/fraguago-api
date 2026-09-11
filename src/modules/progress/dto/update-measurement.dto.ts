import { PartialType } from '@nestjs/mapped-types'; // o '@nestjs/swagger' si usas Swagger
import { CreateMeasurementDto } from './create-measurement.dto';

export class UpdateMeasurementDto extends PartialType(CreateMeasurementDto) {}