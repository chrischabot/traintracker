export interface StopInfo {
  stanox: string;
  name: string;
  time: number;
  eventType: "arrival" | "departure";
  delayMinutes: number;
}

export interface TrainState {
  trainId: string;
  lat: number;
  lng: number;
  stanox: string;
  stationName: string;
  status: "on-time" | "slight-delay" | "delayed";
  delayMinutes: number;
  lastUpdate: number;
  tocId: string;
  eventType: "arrival" | "departure";
  terminated?: boolean;
  platform?: string;
  origin?: StopInfo;
  recentStops: StopInfo[];
}

export interface TrainStats {
  total: number;
  onTime: number;
  slightDelay: number;
  delayed: number;
  lastUpdate: number;
}

// Messages sent to clients
export type ServerMessage =
  | { type: "snapshot"; trains: TrainState[]; timestamp: number }
  | { type: "update"; train: TrainState }
  | { type: "remove"; trainId: string }
  | { type: "stats"; total: number; onTime: number; slightDelay: number; delayed: number; lastUpdate: number }
  | { type: "pong" };

// Messages received from clients
export type ClientMessage = { type: "ping" };

// STANOX lookup entry
export interface StanoxLocation {
  lat: number;
  lng: number;
  name: string;
  tiploc: string;
  crs?: string;
}

// Network Rail TRUST message types
export type TrustMessageType =
  | "0001" // Train Activation
  | "0002" // Train Cancellation
  | "0003" // Train Movement
  | "0005" // Train Reinstatement
  | "0006" // Change of Origin
  | "0007" // Change of Identity
  | "0008"; // Change of Location

// Raw TRUST message structure
export interface TrustMessage {
  header: {
    msg_type: TrustMessageType;
    source_dev_id: string;
    user_id: string;
    original_data_source: string;
    msg_queue_timestamp: string;
    source_system_id: string;
  };
  body: {
    train_id: string;
    loc_stanox?: string;
    actual_timestamp?: string;
    planned_timestamp?: string;
    timetable_variation?: string;
    variation_status?: string;
    event_type?: "ARRIVAL" | "DEPARTURE";
    train_terminated?: string;
    toc_id?: string;
    train_service_code?: string;
    direction_ind?: string;
    line_ind?: string;
    platform?: string;
    route?: string;
    current_train_id?: string;
    original_loc_stanox?: string;
    original_loc_timestamp?: string;
    // Activation specific
    schedule_source?: string;
    train_file_address?: string;
    schedule_end_date?: string;
    train_uid?: string;
    creation_timestamp?: string;
    tp_origin_timestamp?: string;
    d1266_record_number?: string;
    tp_origin_stanox?: string;
    origin_dep_timestamp?: string;
    train_call_type?: string;
    train_call_mode?: string;
    schedule_type?: string;
    sched_origin_stanox?: string;
    schedule_wtt_id?: string;
    schedule_start_date?: string;
    // Cancellation specific
    canx_timestamp?: string;
    canx_reason_code?: string;
    canx_type?: string;
  };
}

// Parsed TRUST event for internal processing
export interface ParsedTrainEvent {
  type: "activation" | "movement" | "cancellation" | "reinstatement" | "identity_change";
  trainId: string;
  stanox?: string;
  timestamp: number;
  delayMinutes?: number;
  eventType?: "arrival" | "departure";
  terminated?: boolean;
  tocId?: string;
  platform?: string;
  newTrainId?: string;
}
