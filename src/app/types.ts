export type UserRole = 'teacher' | 'student' | 'mentor';
export type TeacherTab = 'dashboard' | 'spreadsheets' | 'assessment' | 'synthesis';
export type StudentTab = 'materials' | 'practice';

export interface Question {
  id: string;
  topicId: string;
  text: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface TopicParagraph {
  id: string;
  subtitle: string;
  summary: string;
  content: string;
}

export interface Topic {
  id: string;
  title: string;
  paragraphs: TopicParagraph[];
}

export interface HistoryPoint {
  step: number;
  mastery: number;
  difficulty: string;
}

export interface ManualQuestionEntry {
  id: string;
  topicId: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isCorrect: boolean;
}

export interface TeacherRecommendation {
  topicId: string;
  topicTitle: string;
  status: string;
  actionableStep: string;
  currentMastery: number | null;
}

export interface MentorRequest {
  id: string;
  studentName: string;
  topicTitle: string;
  currentMastery: number;
  questionText: string;
  timestamp: string;
}

export interface SpreadsheetStudent {
  id: string;
  name: string;
  grade: string;
  quadraticsMastery: number;
  polynomialsMastery: number;
  systemsMastery: number;
  weakestTopic: string;
  status: 'Mastered' | 'Review Recommended' | 'Critical Intervention';
  lastActive: string;
}

export interface ClassSpreadsheet {
  id: string;
  name: string;
  description: string;
  data: SpreadsheetStudent[];
}
