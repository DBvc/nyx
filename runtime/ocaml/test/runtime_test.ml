let () =
  Alcotest.run "nyx-runtime"
    [
      ( "runtime",
        [
          Alcotest.test_case "hello" `Quick (fun () ->
              Alcotest.(check string)
                "ready" "nyx-runtime ready"
                (Nyx_runtime.Runtime.hello ()));
        ] );
      ("chat", Chat_test.cases);
    ]
