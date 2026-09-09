import { EmergencyContact } from '@prisma/client';

export class EmergencyContactResponseDto {
  id: string;
  name: string;
  phone: string;
  relationship: string;

  constructor(contact: EmergencyContact) {
    this.id = contact.id;
    this.name = contact.name;
    this.phone = contact.phone;
    this.relationship = contact.relationship;
  }
}