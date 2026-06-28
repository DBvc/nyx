let run_protocol () =
  let rec loop () =
    match input_line stdin with
    | line -> (
        match Nyx_runtime.Runtime_protocol.handle_request_line line with
        | Ok response_line ->
            print_endline response_line;
            flush stdout;
            loop ()
        | Error error ->
            prerr_endline
              ("nyx-runtime protocol error: "
              ^ Nyx_runtime.Runtime_protocol.error_to_string error);
            exit 1)
    | exception End_of_file -> ()
  in
  loop ()

let () =
  match Array.to_list Sys.argv with
  | [ _; "ping" ] -> print_endline "pong"
  | [ _; "protocol" ] -> run_protocol ()
  | _ -> print_endline (Nyx_runtime.Runtime.hello ())
