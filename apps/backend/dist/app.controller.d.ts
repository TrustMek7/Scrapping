import { PrismaService } from "./prisma/prisma.service";
export declare class AppController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    health(): Promise<{
        status: string;
        database: "error" | "ok";
        timestamp: string;
    }>;
}
