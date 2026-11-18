import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_SAVED_ADDRESSES } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(customerId: string) {
    return this.prisma.address.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MAX_SAVED_ADDRESSES,
      select: {
        id: true, houseNumber: true, street: true, locality: true, floor: true, flatNumber: true,
        landmark: true, instructions: true, latitude: true, longitude: true, createdAt: true,
      },
    });
  }

  async create(customerId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { customerId, deletedAt: null } });
    if (count >= MAX_SAVED_ADDRESSES) {
      throw new BadRequestException(`You can save up to ${MAX_SAVED_ADDRESSES} addresses. Delete one first.`);
    }
    return this.prisma.address.create({ data: { ...dto, customerId } });
  }

  async remove(customerId: string, id: string) {
    // Soft delete: past orders keep pointing at the address they used.
    const res = await this.prisma.address.updateMany({
      where: { id, customerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count !== 1) throw new NotFoundException();
    return { ok: true };
  }
}
