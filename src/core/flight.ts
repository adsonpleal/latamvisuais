// Union uses a separate body sprite, like riding. IDs come from ragassets'
// gateway/internal/render/resolve/data/job_names.txt (index + 3950).
const FLYING_JOBS: Record<number, number> = {
  4047: 4048, // Mestre Taekwon — 권성융합 (STAR2)
  4239: 4243, // Mestre Estelar — 성제융합 (STAR_EMPEROR2)
  4302: 4316, // Sky Emperor — SKY_EMPEROR2
};

export function flyingJobFor(classId: number): number | undefined {
  return FLYING_JOBS[classId];
}
