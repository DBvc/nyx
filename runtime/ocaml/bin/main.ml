let () =
  match Array.to_list Sys.argv with
  | [ _; "ping" ] -> print_endline "pong"
  | _ -> print_endline (Nyx_runtime.Runtime.hello ())
