export type RequestDecision =
    | { readonly kind: 'pending' }
    | {
          readonly kind: 'accepted';
          readonly skillId: string;
          readonly decidedBy: string;
          readonly decidedAt: Date;
      }
    | {
          readonly kind: 'rejected';
          readonly reason: string;
          readonly decidedBy: string;
          readonly decidedAt: Date;
      };

/** Размеченное объединение: «принято без навыка» собрать невозможно. */
export const RequestDecision = {
    pending(): RequestDecision {
        return { kind: 'pending' };
    },
    accepted(skillId: string, decidedBy: string, decidedAt: Date): RequestDecision {
        return { kind: 'accepted', skillId, decidedBy, decidedAt };
    },
    rejected(reason: string, decidedBy: string, decidedAt: Date): RequestDecision {
        return { kind: 'rejected', reason, decidedBy, decidedAt };
    },
};
