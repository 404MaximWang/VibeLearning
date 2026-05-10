import type {
  LearningEffect,
  LearningEvent,
  LearningSession,
  PageSummary,
  ResumeTarget,
  TransitionResult
} from "../types/learning";

export const initialLearningSession: LearningSession = {
  state: "idle"
};

const activeLlmStates = new Set<LearningSession["state"]>([
  "explaining",
  "evaluating_answer",
  "answering_user_question",
  "summarizing_page"
]);

function resumeTargetFor(session: LearningSession): ResumeTarget | undefined {
  if (session.state === "explaining") {
    return { state: "explaining" };
  }

  if (session.state === "awaiting_answer" && session.currentQuestion) {
    return {
      state: "awaiting_answer",
      questionId: session.currentQuestion.id
    };
  }

  if (session.state === "summarizing_page") {
    return { state: "summarizing_page" };
  }

  return undefined;
}

function createPageRecord(
  session: LearningSession,
  summary: PageSummary
) {
  return {
    documentId: session.documentId ?? "unknown",
    pageNumber: session.pageNumber ?? 0,
    status: "completed" as const,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    questions: summary.questions,
    mistakes: summary.mistakes.map((mistake, index) => ({
      id: `mistake-${Date.now()}-${index}`,
      ...mistake
    })),
    updatedAt: new Date().toISOString()
  };
}

export function transition(
  session: LearningSession,
  event: LearningEvent
): TransitionResult {
  if (event.type === "CANCEL") {
    const effects: LearningEffect[] = activeLlmStates.has(session.state)
      ? [{ type: "cancel_llm_stream" }]
      : [];
    return { session: initialLearningSession, effects };
  }

  if (event.type === "SELECT_PAGE") {
    const effects: LearningEffect[] = activeLlmStates.has(session.state)
      ? [{ type: "cancel_llm_stream" }]
      : [];

    return {
      session: {
        state: "page_selected",
        documentId: event.documentId,
        pageNumber: event.pageNumber
      },
      effects
    };
  }

  if (event.type === "USER_INTERRUPTS") {
    return {
      session: {
        ...session,
        state: event.message ? "answering_user_question" : "interrupted",
        resumeTarget: resumeTargetFor(session),
        error: undefined
      },
      effects: [
        ...(activeLlmStates.has(session.state)
          ? [{ type: "cancel_llm_stream" } as const]
          : []),
        ...(event.message
          ? [{ type: "start_llm_user_answer", message: event.message } as const]
          : [])
      ]
    };
  }

  switch (session.state) {
    case "idle":
      if (event.type === "OPEN_DOCUMENT") {
        return {
          session: { state: "idle", documentId: event.documentId },
          effects: []
        };
      }
      return { session, effects: [] };

    case "page_selected":
      if (
        event.type === "PREPARE_CONTEXT" &&
        session.documentId &&
        session.pageNumber
      ) {
        return {
          session: { ...session, state: "preparing_context" },
          effects: [
            {
              type: "render_page_context",
              documentId: session.documentId,
              pageNumber: session.pageNumber
            }
          ]
        };
      }
      return { session, effects: [] };

    case "preparing_context":
      if (event.type === "CONTEXT_READY") {
        return {
          session: {
            ...session,
            state: "explaining",
            context: event.context,
            error: undefined
          },
          effects: [{ type: "start_llm_explanation", context: event.context }]
        };
      }

      if (event.type === "CONTEXT_FAILED") {
        return {
          session: { ...session, state: "error", error: event.error },
          effects: []
        };
      }

      return { session, effects: [] };

    case "explaining":
      if (event.type === "LLM_ASKS_QUESTION") {
        return {
          session: {
            ...session,
            state: "questioning",
            currentQuestion: event.question
          },
          effects: []
        };
      }

      if (event.type === "LLM_FINISHES_EXPLANATION") {
        return {
          session: { ...session, state: "summarizing_page" },
          effects: [{ type: "start_llm_page_summary" }]
        };
      }

      if (event.type === "LLM_ERROR") {
        return {
          session: { ...session, state: "error", error: event.error },
          effects: []
        };
      }

      return { session, effects: [] };

    case "questioning":
      if (event.type === "QUESTION_RENDERED") {
        return {
          session: { ...session, state: "awaiting_answer" },
          effects: []
        };
      }
      return { session, effects: [] };

    case "awaiting_answer":
      if (event.type === "USER_ANSWER") {
        return {
          session: { ...session, state: "evaluating_answer" },
          effects: [
            {
              type: "start_llm_answer_evaluation",
              questionId: event.questionId,
              answer: event.answer
            }
          ]
        };
      }

      if (event.type === "USER_ASKS_CLARIFICATION") {
        return {
          session: {
            ...session,
            state: "answering_user_question",
            resumeTarget: resumeTargetFor(session)
          },
          effects: [{ type: "start_llm_user_answer", message: event.message }]
        };
      }

      if (event.type === "SKIP_QUESTION") {
        return {
          session: { ...session, state: "explaining", currentQuestion: undefined },
          effects: session.context
            ? [{ type: "start_llm_explanation", context: session.context }]
            : []
        };
      }

      return { session, effects: [] };

    case "evaluating_answer":
      if (event.type === "LLM_EVALUATES_ANSWER") {
        if (event.evaluation.followUpQuestion) {
          return {
            session: {
              ...session,
              state: "questioning",
              currentQuestion: event.evaluation.followUpQuestion
            },
            effects: []
          };
        }

        return {
          session: { ...session, state: "explaining", currentQuestion: undefined },
          effects: session.context
            ? [{ type: "start_llm_explanation", context: session.context }]
            : []
        };
      }

      if (event.type === "LLM_ERROR") {
        return {
          session: { ...session, state: "error", error: event.error },
          effects: []
        };
      }

      return { session, effects: [] };

    case "interrupted":
      if (event.type === "USER_MESSAGE") {
        return {
          session: { ...session, state: "answering_user_question" },
          effects: [{ type: "start_llm_user_answer", message: event.message }]
        };
      }

      if (event.type === "RESUME") {
        return {
          session: { ...session, state: "resuming_lesson" },
          effects: []
        };
      }

      return { session, effects: [] };

    case "answering_user_question":
      if (event.type === "LLM_FINISHES_USER_ANSWER") {
        return {
          session: { ...session, state: "resuming_lesson" },
          effects: []
        };
      }

      if (event.type === "USER_MESSAGE") {
        return {
          session,
          effects: [{ type: "start_llm_user_answer", message: event.message }]
        };
      }

      if (event.type === "LLM_ERROR") {
        return {
          session: { ...session, state: "error", error: event.error },
          effects: []
        };
      }

      return { session, effects: [] };

    case "resuming_lesson":
      if (
        event.type === "RESUME_TO_AWAITING_ANSWER" &&
        session.currentQuestion?.id === event.questionId
      ) {
        return {
          session: {
            ...session,
            state: "awaiting_answer",
            resumeTarget: undefined
          },
          effects: []
        };
      }

      if (event.type === "RESUME_TO_SUMMARY") {
        return {
          session: {
            ...session,
            state: "summarizing_page",
            resumeTarget: undefined
          },
          effects: [{ type: "start_llm_page_summary" }]
        };
      }

      if (event.type === "RESUME_TO_EXPLANATION") {
        return {
          session: {
            ...session,
            state: "explaining",
            resumeTarget: undefined
          },
          effects: session.context
            ? [{ type: "start_llm_explanation", context: session.context }]
            : []
        };
      }

      return { session, effects: [] };

    case "summarizing_page":
      if (event.type === "LLM_SUMMARIZES_PAGE") {
        const record = createPageRecord(session, event.summary);
        return {
          session: {
            ...session,
            state: "page_completed",
            recordDraft: record
          },
          effects: [{ type: "save_page_record", record }]
        };
      }

      if (event.type === "LLM_ERROR") {
        return {
          session: { ...session, state: "error", error: event.error },
          effects: []
        };
      }

      return { session, effects: [] };

    case "page_completed":
      return { session, effects: [] };

    case "error":
      if (event.type === "RETRY") {
        if (session.documentId && session.pageNumber) {
          return {
            session: { ...session, state: "page_selected", error: undefined },
            effects: []
          };
        }
        return { session: initialLearningSession, effects: [] };
      }
      return { session, effects: [] };
  }
}
