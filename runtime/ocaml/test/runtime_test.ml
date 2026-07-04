let () =
  Alcotest.run "nyx-runtime"
    [
      ("runtime_protocol", Runtime_protocol_test.cases);
      ("runtime_property", Runtime_property_test.cases);
      ("chat", Chat_test.cases);
    ]
