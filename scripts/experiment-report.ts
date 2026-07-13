import { experimentStore } from "../src/autopilot/experiments/store";
import { writeCurrentExperimentReport } from "../src/autopilot/experiments/report";

const now = new Date();
console.log(writeCurrentExperimentReport(experimentStore(), now));
