export type LearningState =
  | "idle"
  | "page_selected"
  | "preparing_context"
  | "explaining"
  | "questioning"
  | "awaiting_answer"
  | "evaluating_answer"
  | "interrupted"
  | "answering_user_question"
  | "resuming_lesson"
  | "summarizing_page"
  | "page_completed"
  | "error";

export type PageLearningStatus = "not_started" | "in_progress" | "completed";

export type PageContext = {
  documentId: string;
  pageNumber: number;
  sources?: LearningSource[];
  pageImage: {
    mimeType: "image/png" | "image/jpeg";
    dataRef: string;
  };
  extractedText?: string;
  previousPageSummary?: string;
  existingRecord?: PageLearningRecord;
};

export type LearningSource =
  | {
      type: "pdf_page";
      documentId: string;
      pageNumber: number;
      regionHint?: string;
    }
  | {
      type: "code_snippet";
      fileName?: string;
      language: string;
      code: string;
      lineRange?: [number, number];
    }
  | {
      type: "lecture_snapshot";
      imageRef: string;
      note?: string;
    };

export type QuestionAnswerKind =
  | "single_choice"
  | "multiple_choice"
  | "cloze"
  | "short_answer"
  | "code_reading"
  | "code_completion"
  | "code_writing";

export type QuestionOption = {
  id: string;
  text: string;
};

export type LearningQuestion = {
  id: string;
  answerKind: QuestionAnswerKind;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  options?: QuestionOption[];
  correctOptionIds?: string[];
  blanks?: Array<{
    id: string;
    label: string;
    acceptedAnswers: string[];
  }>;
  expectedPlainTextAnswer?: string;
  expectedFocus: string[];
  explanation?: string;
  source: {
    documentId: string;
    pageNumber: number;
    regionHint?: string;
  };
  code?: CodeQuestionPayload;
};

export type CodeVerificationMode =
  | "none"
  | "llm_review"
  | "snippet_tests"
  | "project_tests";

export type CodeQuestionPayload = {
  language: "python" | "javascript" | "typescript" | "rust";
  starterCode: string;
  userEditRegion?: {
    startMarker: string;
    endMarker: string;
  };
  verificationMode: CodeVerificationMode;
  rubric: Array<{
    criterion: string;
    required: boolean;
  }>;
  tests?: Array<{
    input: string;
    expectedOutput: string;
    hidden: boolean;
  }>;
};

export type AnswerEvaluation = {
  questionId: string;
  feedback: string;
  isCorrect: boolean;
  score?: number;
  missingConcepts: string[];
  followUpQuestion?: LearningQuestion;
};

export type PageSummary = {
  title: string;
  summary: string;
  keyPoints: string[];
  formulas: Array<{
    label: string;
    body: string;
  }>;
  questions: LearningQuestion[];
  mistakes: Array<{
    description: string;
    correction: string;
    sourceQuestionId?: string;
  }>;
};

export type LearningMistake = {
  id: string;
  sourceQuestionId?: string;
  description: string;
  correction: string;
};

export type PageLearningRecord = {
  documentId: string;
  pageNumber: number;
  status: PageLearningStatus;
  summary?: string;
  keyPoints: string[];
  questions: LearningQuestion[];
  mistakes: LearningMistake[];
  updatedAt: string;
};

export type ResumeTarget =
  | { state: "explaining"; cursor?: string }
  | { state: "awaiting_answer"; questionId: string }
  | { state: "summarizing_page" };

export type LearningEvent =
  | { type: "OPEN_DOCUMENT"; documentId: string }
  | { type: "SELECT_PAGE"; documentId: string; pageNumber: number }
  | { type: "PREPARE_CONTEXT" }
  | { type: "CONTEXT_READY"; context: PageContext }
  | { type: "CONTEXT_FAILED"; error: string }
  | { type: "LLM_ASKS_QUESTION"; question: LearningQuestion }
  | { type: "QUESTION_RENDERED"; questionId: string }
  | { type: "USER_ANSWER"; questionId: string; answer: string }
  | { type: "USER_ASKS_CLARIFICATION"; message: string }
  | { type: "USER_INTERRUPTS"; message?: string }
  | { type: "USER_MESSAGE"; message: string }
  | { type: "LLM_EVALUATES_ANSWER"; evaluation: AnswerEvaluation }
  | { type: "LLM_FINISHES_EXPLANATION" }
  | { type: "LLM_FINISHES_USER_ANSWER" }
  | { type: "LLM_SUMMARIZES_PAGE"; summary: PageSummary }
  | { type: "RESUME" }
  | { type: "RESUME_TO_EXPLANATION" }
  | { type: "RESUME_TO_AWAITING_ANSWER"; questionId: string }
  | { type: "RESUME_TO_SUMMARY" }
  | { type: "SKIP_QUESTION"; questionId: string }
  | { type: "REVIEW_PAGE"; pageNumber: number }
  | { type: "EXPORT_NOTES"; pageNumber?: number }
  | { type: "LLM_ERROR"; error: string }
  | { type: "RETRY" }
  | { type: "CANCEL" };

export type LearningSession = {
  state: LearningState;
  documentId?: string;
  pageNumber?: number;
  context?: PageContext;
  currentQuestion?: LearningQuestion;
  resumeTarget?: ResumeTarget;
  recordDraft?: PageLearningRecord;
  error?: string;
};

export type LearningEffect =
  | { type: "render_page_context"; documentId: string; pageNumber: number }
  | { type: "start_llm_explanation"; context: PageContext }
  | { type: "start_llm_answer_evaluation"; questionId: string; answer: string }
  | { type: "start_llm_user_answer"; message: string }
  | { type: "start_llm_page_summary" }
  | { type: "cancel_llm_stream" }
  | { type: "save_page_record"; record: PageLearningRecord };

export type TransitionResult = {
  session: LearningSession;
  effects: LearningEffect[];
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  thinking?: string;
  state?: LearningState;
};
