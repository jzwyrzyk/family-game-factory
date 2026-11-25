/** Storage values are immutable. Ordering and labels belong to this table. */
export const GRADES = [-1, 0, 1, 2, 3, 4] as const;
export type Grade = typeof GRADES[number];
export const isGrade = (value: unknown): value is Grade => GRADES.some(grade => grade === value);
export const isEarlyGrade = (grade: unknown) => grade === -1 || grade === 0;
export const gradeLabel = (grade: Grade) => grade === -1 ? 'Pre-K' : grade === 0 ? 'Kindergarten' : `Grade ${grade}`;
export const gradeRank = (grade: Grade) => GRADES.indexOf(grade);
export const withinGrade = (content: Grade, ceiling: Grade) =>
  isGrade(content) && isGrade(ceiling) && gradeRank(content) <= gradeRank(ceiling);
export const previousGrade = (grade: Grade) => GRADES[Math.max(0, gradeRank(grade) - 1)];
export function parseGradeOption(value: string): Grade {
  const grade = GRADES.find(entry => String(entry) === value);
  if (grade === undefined) throw Error('Choose a listed learning grade.');
  return grade;
}

// Vite's named preview mode is selected by the synthetic acceptance build.
export function selectableGrades(earlyPreview: boolean): readonly Grade[] {
  return earlyPreview ? GRADES : GRADES.filter(grade => !isEarlyGrade(grade));
}
