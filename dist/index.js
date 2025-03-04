#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const fs_1 = __importDefault(require("fs"));
const runner_1 = require("@stepci/runner");
const loadtesting_1 = require("@stepci/runner/dist/loadtesting");
const plugin_openapi_1 = require("@stepci/plugin-openapi");
const exit_1 = __importDefault(require("exit"));
const chalk_1 = __importDefault(require("chalk"));
const node_events_1 = require("node:events");
const constants_1 = require("./lib/constants");
const utils_1 = require("./lib/utils");
const render_1 = require("./lib/render");
const analytics_1 = require("./lib/analytics");
let verbose = false;
(0, render_1.renderAnalyticsMessage)();
const ee = new node_events_1.EventEmitter();
ee.on('test:result', (test) => {
    console.log(`${(test.passed ? chalk_1.default.bgGreenBright(' PASS ') : chalk_1.default.bgRedBright(' FAIL '))} ${chalk_1.default.bold(test.name || test.id)} ⏲ ${test.duration / 1000 + 's'} ${chalk_1.default.magenta('⬆')} ${test.bytesSent} bytes ${chalk_1.default.cyan('⬇')} ${test.bytesReceived} bytes`);
    if (!test.passed || verbose) {
        (0, render_1.renderStepSummary)(test.steps);
        test.steps.forEach(step => (0, render_1.renderStep)(step, { verbose }));
    }
});
ee.on('workflow:result', ({ result }) => {
    (0, render_1.renderSummary)(result);
    (0, render_1.renderFeedbackMessage)();
    if (!result.passed)
        (0, exit_1.default)(5);
});
(0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .command('run [workflow]', 'run workflow', (yargs) => {
    return yargs
        .positional('workflow', {
        describe: 'workflow file path',
        type: 'string',
        default: 'workflow.yml'
    })
        .option('e', {
        alias: 'env',
        array: true,
        demandOption: false,
        describe: 'env variables to use',
        type: 'string'
    })
        .option('s', {
        alias: 'secret',
        array: true,
        demandOption: false,
        describe: 'secret variables to use',
        type: 'string'
    })
        .option('verbose', {
        alias: 'v',
        boolean: true,
        demandOption: false,
        describe: 'verbose output',
        type: 'boolean'
    })
        .option('loadtest', {
        alias: 'load',
        boolean: true,
        demandOption: false,
        describe: 'run workflow in load-testing mode',
        type: 'boolean'
    })
        .option('concurrency', {
        number: true,
        demandOption: false,
        describe: 'number of concurrency executions',
        type: 'number'
    })
        .check(({ e: envs, s: secrets }) => {
        if ((0, utils_1.checkOptionalEnvArrayFormat)(envs)) {
            throw new Error('env variables have wrong format, use `env=VARIABLE`.');
        }
        if ((0, utils_1.checkOptionalEnvArrayFormat)(secrets)) {
            throw new Error('secret variables have wrong format, use `secret=VARIABLE`.');
        }
        return true;
    });
}, async (argv) => {
    verbose = argv.verbose;
    if (argv.loadtest) {
        console.log(chalk_1.default.yellowBright(`⚠︎ Running a load test. This may take a while`));
        const { result } = await (0, loadtesting_1.loadTestFromFile)(argv.workflow, {
            env: (0, utils_1.parseEnvArray)(argv.e),
            secrets: (0, utils_1.parseEnvArray)(argv.s)
        });
        (0, render_1.renderLoadTest)(result);
        (0, render_1.renderFeedbackMessage)();
        if (!result.passed)
            (0, exit_1.default)(5);
        return;
    }
    (0, runner_1.runFromFile)(argv.workflow, {
        env: (0, utils_1.parseEnvArray)(argv.e),
        secrets: (0, utils_1.parseEnvArray)(argv.s),
        ee,
        concurrency: argv.concurrency
    });
})
    .command('generate [spec] [path]', 'generate workflow from OpenAPI spec', yargs => {
    return yargs
        .positional('spec', {
        describe: 'openapi file url',
        type: 'string',
        default: 'openapi.json'
    })
        .positional('path', {
        describe: 'output file path',
        type: 'string',
        default: './workflow.yml'
    })
        .positional('generatePathParams', { type: 'boolean', default: true })
        .positional('generateOptionalParams', { type: 'boolean', default: true })
        .positional('generateRequestBody', { type: 'boolean', default: true })
        .positional('useExampleValues', { type: 'boolean', default: true })
        .positional('useDefaultValues', { type: 'boolean', default: true })
        .positional('checkStatus', { type: 'boolean', default: true })
        .positional('checkExamples', { type: 'boolean', default: true })
        .positional('checkSchema', { type: 'boolean', default: true })
        .positional('contentType', { type: 'string', default: 'application/json' });
}, async (argv) => {
    const generateWorkflowConfig = {
        generator: {
            pathParams: argv.generatePathParams,
            optionalParams: argv.generateOptionalParams,
            requestBody: argv.generateRequestBody,
            useExampleValues: argv.useExampleValues,
            useDefaultValues: argv.useDefaultValues,
        },
        check: {
            status: argv.checkStatus,
            examples: argv.checkExamples,
            schema: argv.checkSchema
        },
        contentType: argv.contentType
    };
    await (0, plugin_openapi_1.generateWorkflowFile)(argv.spec, argv.path, generateWorkflowConfig);
    console.log(`${chalk_1.default.greenBright('Success!')} The workflow file can be found at ${argv.path}`);
    (0, render_1.renderFeedbackMessage)();
})
    .command('init', 'Init a Step CI workflow', yargs => {
    return yargs
        .positional('path', {
        describe: 'workflow file path',
        type: 'string',
        default: 'workflow.yml'
    });
}, (argv) => {
    const defaultWorkflow = `version: "1.1"
name: Status Check
env:
  host: example.com
tests:
  example:
    steps:
      - name: GET request
        http:
          url: https://\${{env.host}}
          method: GET
          check:
            status: /^20/`;
    fs_1.default.writeFileSync(argv.path, defaultWorkflow);
    console.log(`${chalk_1.default.greenBright('Success!')} The workflow file can be found at ${argv.path}\nEnter ${chalk_1.default.grey('npx stepci run ' + argv.path)} to run it`);
})
    .command(['$0'], false, () => { }, () => console.log(constants_1.defaultText))
    .parse();
(0, analytics_1.sendAnalyticsEvent)();
