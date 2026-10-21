import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CitiesService } from "./cities.service";

@ApiTags("cities")
@Controller({ path: "cities", version: "1" })
export class CitiesController {
  constructor(private cities: CitiesService) {}

  @Get()
  @ApiOperation({ summary: "List the supported Moroccan cities (public)" })
  findAll() {
    return this.cities.findAll();
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get one city by slug (public)" })
  findOne(@Param("slug") slug: string) {
    return this.cities.findBySlug(slug);
  }
}
