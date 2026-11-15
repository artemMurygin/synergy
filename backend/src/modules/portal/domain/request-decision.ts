export type RequestDecision =
    | { readonly kind: 'new' }
    | {
          readonly kind: 'under_review';
          readonly reviewerId: string;
          readonly takenAt: Date;
      }
    | {
          readonly kind: 'accepted';
          readonly reviewerId: string;
          readonly takenAt: Date;
          readonly skillId: string;
          /** null только у заявок, принятых до появления оценки. */
          readonly effortHours: number | null;
          readonly decidedBy: string;
          readonly decidedAt: Date;
      }
    | {
          readonly kind: 'rejected';
          readonly reviewerId: string;
          readonly takenAt: Date;
          readonly reason: string;
          readonly decidedBy: string;
          readonly decidedAt: Date;
      };

export type RequestStatusKind = RequestDecision['kind'];

/** Размеченное объединение: «принято без навыка» или «решено без взявшего» собрать невозможно. */
export const RequestDecision = {
    new(): RequestDecision {
        return { kind: 'new' };
    },
    underReview(reviewerId: string, takenAt: Date): RequestDecision {
        return { kind: 'under_review', reviewerId, takenAt };
    },
    accepted(
        reviewerId: string,
        takenAt: Date,
        skillId: string,
        effortHours: number | null,
        decidedBy: string,
        decidedAt: Date,
    ): RequestDecision {
        return {
            kind: 'accepted',
            reviewerId,
            takenAt,
            skillId,
            effortHours,
            decidedBy,
            decidedAt,
        };
    },
    rejected(
        reviewerId: string,
        takenAt: Date,
        reason: string,
        decidedBy: string,
        decidedAt: Date,
    ): RequestDecision {
        return { kind: 'rejected', reviewerId, takenAt, reason, decidedBy, decidedAt };
    },
};
