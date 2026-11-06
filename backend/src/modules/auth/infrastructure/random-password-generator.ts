import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordGenerator } from '../domain/ports/password-generator.port';

const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const LENGTH = 16;

function pick(alphabet: string): string {
    return alphabet[randomInt(alphabet.length)] ?? '';
}

@Injectable()
export class RandomPasswordGenerator extends PasswordGenerator {
    generate(): string {
        const chars = [pick(LETTERS), pick(DIGITS)];
        const all = LETTERS + DIGITS;
        while (chars.length < LENGTH) chars.push(pick(all));
        for (let i = chars.length - 1; i > 0; i -= 1) {
            const j = randomInt(i + 1);
            [chars[i], chars[j]] = [chars[j] ?? '', chars[i] ?? ''];
        }
        return chars.join('');
    }
}
