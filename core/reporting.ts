import { writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  FullConfig, FullResult, Suite, TestCase, TestError, TestResult, TestStep,
} from "@playwright/test/reporter";
import AllureReporter from "allure-playwright";
import { ALLURE_RUNTIME_MESSAGE_CONTENT_TYPE } from "allure-js-commons/sdk/reporter";
import { forwardWorkerLog, log, redactText } from "./logging";
import {
  failureScreenshot,
  smsHttpSummary,
  unavailableScreenshot,
} from "./report-attachments";

const failedStatuses: ReadonlySet<TestResult["status"]> =
  new Set(["failed", "timedOut", "interrupted"]);

const parameterValues: Readonly<Record<string, readonly string[]>> = {
  "Способ входа": ["Телефон", "E-mail", "SMS"],
  "Пустое поле": ["Логин", "Пароль"],
};

function caseIdOf(test: TestCase) {
  return test.title.match(/ТК-[А-Я]+-\d+/u)?.[0];
}

function cleanError(error: TestError): TestError {
  const sourceMessage = error.message ?? error.value ?? "Ошибка выполнения теста";
  const frames = error.stack?.split("\n").filter((line) => /^\s+at /.test(line));
  const message = redactText(sourceMessage);
  return {
    message,
    stack: frames?.length ? [message, ...frames.map(redactText)].join("\n") : undefined,
    location: error.location && {
      ...error.location,
      file: redactText(error.location.file),
    },
  };
}

function safeAttachments(attachments: TestResult["attachments"]): TestResult["attachments"] {
  return attachments.flatMap((attachment) => {
    if (!attachment.body) return [];
    if (attachment.name === failureScreenshot && attachment.contentType === "image/png") {
      return [attachment];
    }
    if (attachment.name === unavailableScreenshot && attachment.contentType === "text/plain") {
      return [{ ...attachment, body: Buffer.from(redactText(attachment.body.toString("utf8"))) }];
    }
    if (attachment.name === smsHttpSummary && attachment.contentType === "application/json") {
      try {
        const summary = JSON.parse(attachment.body.toString("utf8"));
        if (Number.isInteger(summary.count) && summary.count >= 0 && Array.isArray(summary.outcomes)) {
          const outcomes = summary.outcomes.filter((outcome: unknown) =>
            (typeof outcome === "number" && Number.isInteger(outcome) && outcome >= 100 && outcome < 600) ||
            outcome === "сбой сети" || outcome === "нет ответа",
          );
          return [{ ...attachment, body: Buffer.from(JSON.stringify({ count: summary.count, outcomes })) }];
        }
      } catch {
        return [];
      }
    }
    if (attachment.contentType === ALLURE_RUNTIME_MESSAGE_CONTENT_TYPE) {
      try {
        const message = JSON.parse(attachment.body.toString("utf8"));
        if (message.type !== "metadata" || !Array.isArray(message.data?.parameters)) return [];
        const parameters = message.data.parameters
          .filter((parameter: { name?: unknown; value?: unknown } | null) =>
            typeof parameter?.name === "string" &&
            typeof parameter.value === "string" &&
            Object.hasOwn(parameterValues, parameter.name) &&
            parameterValues[parameter.name].includes(parameter.value),
          )
          .map(({ name, value }: { name: string; value: string }) => ({ name, value }));
        if (parameters.length) {
          return [{
            ...attachment,
            name: "Allure Metadata (metadata)",
            body: Buffer.from(JSON.stringify({ type: "metadata", data: { parameters } })),
          }];
        }
      } catch {
        return [];
      }
    }
    return [];
  });
}

export default class Reporting extends AllureReporter {
  private readonly reportTests = new WeakMap<TestCase, TestCase>();
  private readonly reportSteps = new WeakMap<TestStep, TestStep>();

  constructor() {
    super({ detail: false, reportAnnotations: false });
  }

  override onConfigure(config: FullConfig) {
    super.onConfigure(config);
    this.options = {
      ...this.options,
      resultsDir: resolve(config.projects[0].outputDir, "allure-results"),
    };
  }

  override printsToStdio() {
    return true;
  }

  override onStdOut(chunk?: string | Buffer) {
    if (chunk !== undefined) forwardWorkerLog(chunk);
  }

  override onBegin(suite: Suite) {
    super.onBegin(suite);
    log.info({ tests: suite.allTests().length }, "Начат прогон тестов");
  }

  override onTestBegin(test: TestCase, result: TestResult) {
    super.onTestBegin(this.reportTest(test), result);
    log.info(this.testDetails(test), "Начат тест");
  }

  override onStepBegin(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category === "test.step") {
      super.onStepBegin(this.reportTest(test), result, this.reportStep(step));
      log.info(this.stepDetails(test, step), "Начат шаг");
    } else if (step.category === "pw:api" || step.category === "expect") {
      log.debug({
        ...this.stepDetails(test, step),
        step: step.category === "pw:api"
          ? step.title.match(/^[\w.]+/)?.[0]
          : "Проверка условия Playwright",
      }, "Операция Playwright");
    }
  }

  override onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category !== "test.step") return;
    const safeStep = this.reportStep(step);
    safeStep.duration = step.duration;
    safeStep.error = step.error && cleanError(step.error);
    super.onStepEnd(this.reportTest(test), result, safeStep);

    if (safeStep.error) {
      log.warn({ ...this.stepDetails(test, step), error: safeStep.error.message }, "Шаг завершился ошибкой");
    } else {
      log.debug({ ...this.stepDetails(test, step), durationMs: step.duration }, "Шаг завершён");
    }
  }

  override async onTestEnd(test: TestCase, result: TestResult) {
    const errors = result.errors.map(cleanError);
    const attachments = safeAttachments(result.attachments);
    const details = {
      ...this.testDetails(test),
      status: result.status,
      durationMs: result.duration,
    };

    await this.replaceErrorContext(test, result, errors);

    if (failedStatuses.has(result.status)) {
      if (!attachments.some(({ name }) => name === failureScreenshot)) {
        if (!attachments.some(({ name }) => name === unavailableScreenshot)) {
          attachments.push({
            name: unavailableScreenshot,
            contentType: "text/plain",
            body: Buffer.from("Браузерная страница не была доступна для снимка."),
          });
        }
        log.warn(details, "Скриншот недоступен");
      }
      log.error({ ...details, failures: errors }, "Тест завершился ошибкой");
    } else if (result.status === "skipped") {
      log.warn(details, "Тест пропущен");
    } else {
      log.info(details, "Тест завершён");
    }

    await super.onTestEnd(this.reportTest(test), {
      ...result,
      attachments,
      errors,
      error: errors[0],
      stdout: [],
      stderr: [],
    });
  }

  override onError(error?: TestError) {
    if (error) log.error({ failure: cleanError(error) }, "Ошибка прогона");
  }

  override async onEnd(result?: FullResult) {
    await super.onEnd();
    log.info({ status: result?.status, durationMs: result?.duration }, "Прогон завершён");
  }

  private reportTest(test: TestCase) {
    let sanitized = this.reportTests.get(test);
    if (!sanitized) {
      sanitized = Object.create(test) as TestCase;
      const caseId = caseIdOf(test);
      Object.defineProperties(sanitized, {
        title: {
          value: redactText(test.title) + (caseId ? ` @allure.label.caseId:${caseId}` : ""),
        },
        annotations: {
          value: test.annotations
            .filter(({ type }) => type === "skip" || type === "fixme")
            .map(({ type, description }) => ({ type, description: description && redactText(description) })),
        },
        tags: { value: test.tags.map(redactText) },
      });
      this.reportTests.set(test, sanitized);
    }
    return sanitized;
  }

  private reportStep(step: TestStep): TestStep {
    let sanitized = this.reportSteps.get(step);
    if (!sanitized) {
      sanitized = {
        title: redactText(step.title),
        category: step.category,
        startTime: step.startTime,
        duration: step.duration,
        parent: step.parent && this.reportStep(step.parent),
        location: step.location,
        steps: [],
        attachments: [],
        annotations: [],
        titlePath: () => step.titlePath().map(redactText),
      };
      this.reportSteps.set(step, sanitized);
    }
    return sanitized;
  }

  private testDetails(test: TestCase) {
    return {
      caseId: caseIdOf(test),
      test: redactText(test.title),
      file: relative(this.config.rootDir, test.location.file),
      line: test.location.line,
    };
  }

  private stepDetails(test: TestCase, step: TestStep) {
    return {
      ...this.testDetails(test),
      step: redactText(step.title),
      category: step.category,
      stepFile: step.location && relative(this.config.rootDir, step.location.file),
      stepLine: step.location?.line,
    };
  }

  private async replaceErrorContext(test: TestCase, result: TestResult, errors: TestError[]) {
    const outputDir = test.parent.project()?.outputDir ?? this.config.projects[0].outputDir;
    for (const attachment of result.attachments) {
      if (attachment.name !== "error-context" || !attachment.path ||
          basename(attachment.path) !== "error-context.md") continue;

      const path = relative(outputDir, attachment.path);
      if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) continue;

      const summary = [
        `# ${redactText(test.title)}`,
        "",
        `Статус: ${result.status}`,
        "",
        ...errors.map((error) => error.stack ?? error.message ?? ""),
        "",
      ].join("\n");
      await writeFile(attachment.path, summary, "utf8");
    }
  }
}
