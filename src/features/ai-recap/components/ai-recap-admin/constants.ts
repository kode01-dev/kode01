export const RETRY_CHOICE_LATEST_RUN = '__latest_run__';
export const RETRY_CHOICE_PREVIOUS_RUN = '__previous_run__';
export const RETRY_CHOICE_LATEST_SUCCESS = '__latest_success__';
export const RETRY_CHOICE_LATEST_FAILED = '__latest_failed__';

export const minuteOptions = [0, 15, 30, 45] as const;
export const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
