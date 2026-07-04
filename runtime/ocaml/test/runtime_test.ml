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
      ("runtime_protocol", Runtime_protocol_test.cases);
      ("runtime_property", Runtime_property_test.cases);
      ("chat", Chat_test.cases);
    ]
