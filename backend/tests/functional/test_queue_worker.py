from queue_worker import process_task

def test_process_task():
    result = process_task('test_task')
    assert result == 'expected_result'