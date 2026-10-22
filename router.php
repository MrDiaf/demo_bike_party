<?php
// Local development only: php -S ignores .htaccess, so block the same private paths here.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#(^|/)(README\.md|Makefile|router\.php|[^/]*\.docx|\.htaccess)$|(^|/)(guidelines|\.runtime)(/|$)#', $path)) {
    http_response_code(404);
    echo 'Not found';
    return true;
}
return false;
