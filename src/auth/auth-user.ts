import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  mobileNumber: string;
  role: Role;
}
