let run_protocol () =
  let rec loop session =
    match input_line stdin with
    | line -> (
        match Nyx_runtime.Runtime_protocol.handle_session_line session line with
        | Ok (session, response_line) ->
            print_endline response_line;
            flush stdout;
            loop session
        | Error error ->
            prerr_endline
              ("nyx-runtime protocol error: "
              ^ Nyx_runtime.Runtime_protocol.error_to_string error);
            exit 1)
    | exception End_of_file -> ()
  in
  loop Nyx_runtime.Runtime_protocol.initial_session

let usage = "usage: nyx-runtime [ping|protocol]"

let () =
  match Array.to_list Sys.argv with
  | [ _; "ping" ] -> print_endline "pong"
  | [ _; "protocol" ] -> run_protocol ()
  | _ ->
      prerr_endline usage;
      exit 64
