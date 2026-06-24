type role = System | User | Assistant | Tool
type t = { id : string; role : role; content : string }

let role_to_string = function
  | System -> "system"
  | User -> "user"
  | Assistant -> "assistant"
  | Tool -> "tool"
