import { BadRequestException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";

@Injectable()
export class PasswordService {
  private readonly SALT_ROUNDS = 12;

  async hash(plain: string): Promise<string> {
    if (Buffer.byteLength(plain, "utf8") > 72) {
      throw new BadRequestException("Password too long (max 72 bytes)");
    }
    return bcrypt.hash(plain, this.SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
