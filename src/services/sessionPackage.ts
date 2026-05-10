import type {
  ChatMessage,
  LearningQuestion,
  LearningSession,
  PageLearningRecord
} from "../types/learning";

export type LearningSessionPackage = {
  sessionId: string;
  sessionName: string;
  document?: {
    id: string;
    title: string;
    pageCount: number;
  };
  activeUnit?: {
    pageNumber: number;
    pageImage?: string;
  };
  sessionState: LearningSession["state"];
  pageRecords: PageLearningRecord[];
  conversation: Array<{
    role: ChatMessage["role"];
    content: string;
    thinking?: string;
  }>;
  activeQuestion?: LearningQuestion;
  constraints: {
    noRag: true;
    preferMultipleChoice: true;
    noLatexInput: true;
    noTypstInput: true;
  };
};

export type BuildSessionPackageInput = {
  sessionId: string;
  sessionName: string;
  document?: {
    id: string;
    title: string;
    pageCount: number;
  };
  activePage?: {
    pageNumber: number;
    imageDataUrl?: string;
  };
  learningSession: LearningSession;
  pageRecords: PageLearningRecord[];
  messages: ChatMessage[];
};

export function buildSessionPackage(
  input: BuildSessionPackageInput
): LearningSessionPackage {
  return {
    sessionId: input.sessionId,
    sessionName: input.sessionName,
    document: input.document,
    activeUnit: input.activePage
      ? {
          pageNumber: input.activePage.pageNumber,
          pageImage: input.activePage.imageDataUrl
        }
      : undefined,
    sessionState: input.learningSession.state,
    pageRecords: input.pageRecords,
    conversation: input.messages.slice(-24).map((message) => ({
      role: message.role,
      content: message.content,
      thinking: message.thinking
    })),
    activeQuestion: input.learningSession.currentQuestion,
    constraints: {
      noRag: true,
      preferMultipleChoice: true,
      noLatexInput: true,
      noTypstInput: true
    }
  };
}
