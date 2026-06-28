type request = Ping of { id : string }
type response = Pong of { id : string }

type error =
  | Invalid_json of string
  | Missing_type
  | Invalid_type
  | Unknown_type of string
  | Missing_id
  | Invalid_id

let string_field fields name ~missing ~invalid =
  match List.assoc_opt name fields with
  | None -> Error missing
  | Some (`String value) when value <> "" -> Ok value
  | Some (`String _) -> Error invalid
  | Some _ -> Error invalid

let decode_request_json = function
  | `Assoc fields -> (
      match
        string_field fields "type" ~missing:Missing_type ~invalid:Invalid_type
      with
      | Error error -> Error error
      | Ok "ping" -> (
          match
            string_field fields "id" ~missing:Missing_id ~invalid:Invalid_id
          with
          | Ok id -> Ok (Ping { id })
          | Error error -> Error error)
      | Ok message_type -> Error (Unknown_type message_type))
  | _ -> Error (Invalid_json "expected JSON object")

let decode_request_line line =
  try Yojson.Basic.from_string line |> decode_request_json
  with Yojson.Json_error message -> Error (Invalid_json message)

let encode_response = function
  | Pong { id } ->
      `Assoc [ ("type", `String "pong"); ("id", `String id) ]
      |> Yojson.Basic.to_string

let response_for_request = function Ping { id } -> Pong { id }

let handle_request_line line =
  match decode_request_line line with
  | Ok request -> Ok (request |> response_for_request |> encode_response)
  | Error error -> Error error

let error_to_string = function
  | Invalid_json message -> "invalid JSON: " ^ message
  | Missing_type -> "missing type"
  | Invalid_type -> "invalid type"
  | Unknown_type message_type -> "unknown type: " ^ message_type
  | Missing_id -> "missing id"
  | Invalid_id -> "invalid id"
