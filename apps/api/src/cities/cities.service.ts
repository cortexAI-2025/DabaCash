import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class CitiesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true, slug: true, name: true, nameAr: true, region: true,
        latitude: true, longitude: true,
        _count: { select: { franchises: { where: { status: "ACTIVE" } } } },
      },
    });
  }

  async findBySlug(slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city || !city.isActive) throw new NotFoundException(`Unknown city: ${slug}`);
    return city;
  }
}
