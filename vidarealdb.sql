-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 21-05-2025 a las 11:11:13
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `vidarealdb`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuario`
--

CREATE TABLE `usuario` (
  `id` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `apellidos` varchar(75) NOT NULL,
  `email` varchar(255) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  `creado` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `stripe_customer_id` varchar(255) DEFAULT NULL,
  `stripe_subscription_id` varchar(255) DEFAULT NULL,
  `is_subscribed` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuario`
--

INSERT INTO `usuario` (`id`, `nombre`, `apellidos`, `email`, `contrasena`, `creado`, `is_admin`, `stripe_customer_id`, `stripe_subscription_id`, `is_subscribed`) VALUES
(2, 'Gabriel', 'Hernández Collado', 'gabrielhernandezdaw@gmail.com', '$2b$10$o4/GDQu98H2BszesMUnZiOs/9N7N8wZrafKC1kErw5yOawJGvQhAe', '2025-05-14 10:22:23', 1, 'cus_SLSC8YZNpBAkr0', 'sub_1RQmcc2Kv0DNBVg9eBtF0wve', 1),
(4, 'Tiziano2', 'Borra2', 'prueba2@gmail.com', '$2b$10$Y7Sxzdra74tNBjvPnmIi/.eHfOREPtLIU8C4BD8Ee9A5fQ2qFD3le', '2025-05-14 10:34:03', 1, NULL, NULL, 0),
(5, 'hol', 'hol', 'hol@gmail.com', '$2b$10$MvQd9HKG178z8KAgRr6qQejZXZBe9V4g7pcr3LkmWWRAysItushAG', '2025-05-15 09:39:54', 0, 'cus_SLpfLjPVM32FYy', NULL, 1),
(6, 'sa', 'sa', 'sa@gmail.com', '$2b$10$20GJ/NSPDdoyisymv1QQlumknphKy91o9O2L2XaUHg4CX1K9w7yZu', '2025-05-19 08:36:26', 0, NULL, NULL, 0),
(7, 'tiziano', 'borra', 'tizianoborra1@gmail.com', '$2b$10$uK5f6Pw2Ok8FgReGrYsJDOQ8fBWm.gaXEHQjn0Dijm5775DJOEBLi', '2025-05-19 08:40:11', 0, 'cus_SL5x73tUEacbNX', NULL, 1),
(8, '', '', 'prueba@gmail.com', '$2b$10$JEIlc.ftyGM/InYEa1A/bud6WzPOliu1S8CNG6fKyRS7Cu5d.sLVW', '2025-05-21 07:55:43', 0, 'cus_SLp9QpnOlHWEag', NULL, 0);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `video`
--

CREATE TABLE `video` (
  `id` int(11) NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `miniatura` varchar(255) NOT NULL,
  `url` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `video`
--

INSERT INTO `video` (`id`, `titulo`, `miniatura`, `url`) VALUES
(1, 'Xativa VR 360º Valencia', 'https://img.youtube.com/vi/_a9UQztNmaE/0.jpg', '_a9UQztNmaE'),
(2, 'El gorgo de la escalera Anna Valencia VR 360', 'https://img.youtube.com/vi/0UD9cpROYrw/0.jpg', '0UD9cpROYrw'),
(3, 'Cullera Valencia VR 360', 'https://img.youtube.com/vi/4rA9oorwy5w/0.jpg', '4rA9oorwy5w'),
(4, 'Walk beach Spain Cullera wave sound', 'https://img.youtube.com/vi/14gBXiSn-rQ/0.jpg', '14gBXiSn-rQ'),
(5, 'Noche de difuntos en Alcaraz', 'https://img.youtube.com/vi/jk2p_wpbu5s/0.jpg', 'jk2p_wpbu5s'),
(6, 'Corral de comedias Almagro 360', 'https://img.youtube.com/vi/EdSiOiZZxOE/0.jpg', 'EdSiOiZZxOE'),
(7, 'Procesión Semana Santa Granada Albaicín 360', 'https://img.youtube.com/vi/Oa4TGJUy50M/0.jpg', 'Oa4TGJUy50M'),
(8, 'Napoles en Bus a Pompeya 360', 'https://img.youtube.com/vi/ICV16bDGhEM/0.jpg', 'ICV16bDGhEM'),
(9, 'Pompeya', 'https://img.youtube.com/vi/EJLjiEyCERA/0.jpg', 'EJLjiEyCERA'),
(10, 'Pompeya segunda parte Casas y Burdel 360º', 'https://img.youtube.com/vi/TllkyZpvtWQ/0.jpg', 'TllkyZpvtWQ'),
(11, 'Fiesta Halloween crucero', 'https://img.youtube.com/vi/Nh1pJMoveUE/0.jpg', 'Nh1pJMoveUE'),
(12, 'Paseo por dentro de un crucero', 'https://img.youtube.com/vi/Zqmv8lcUXGk/0.jpg', 'Zqmv8lcUXGk'),
(13, 'Paseo en Bus por Casablanca', 'https://img.youtube.com/vi/xTQF4jJBpa4/0.jpg', 'xTQF4jJBpa4'),
(14, 'Dire Straits Legacy Walk of Life', 'https://img.youtube.com/vi/I0JWneIFTQE/0.jpg', 'I0JWneIFTQE'),
(15, 'MERCEDES FASHION WEEK', 'https://img.youtube.com/vi/7IwJhohUhfQ/0.jpg', '7IwJhohUhfQ'),
(16, 'Capilla Sixtina 360', 'https://img.youtube.com/vi/qBtzSw3M24I/0.jpg', 'qBtzSw3M24I'),
(17, 'Procesion Domingo de Ramos Alicante', 'https://img.youtube.com/vi/C4O3ifvbw4w/0.jpg', 'C4O3ifvbw4w'),
(18, '360 PROCESION SANTA CRUZ ALICANTE', 'https://img.youtube.com/vi/0LKUbJ4pm4E/0.jpg', '0LKUbJ4pm4E'),
(19, '360 AC/DC SEVILLA 2024 LIVE Back in Black', 'https://img.youtube.com/vi/xb7-_X2xMWI/0.jpg', 'xb7-_X2xMWI'),
(20, '360 AC/DC HELL BELLS ( LIVE CONCERT LA CARTUJA SEVILLA )', 'https://img.youtube.com/vi/gciA4wzsW6Q/0.jpg', 'gciA4wzsW6Q'),
(21, 'Dj Sylvan Guitar Spell 360 Concert', 'https://img.youtube.com/vi/JYzRNmupEfU/0.jpg', 'JYzRNmupEfU'),
(22, 'Whigfield Saturday Night 360 Live 2024', 'https://img.youtube.com/vi/Lkf0Z_Ag7_k/0.jpg', 'Lkf0Z_Ag7_k'),
(23, 'Mercado LRes YOUT', 'https://img.youtube.com/vi/sEctS2zcXCE/0.jpg', 'sEctS2zcXCE'),
(24, 'IDEA EJEMPLO', 'https://img.youtube.com/vi/0NmcB51Gepg/0.jpg', '0NmcB51Gepg'),
(25, 'Reconocimiento 1 Youtube', 'https://img.youtube.com/vi/3ttz60Bbvug/0.jpg', '3ttz60Bbvug'),
(26, '2 Juegos de Calle Youtube', 'https://img.youtube.com/vi/K082W2oh1ZE/0.jpg', 'K082W2oh1ZE'),
(27, '1 REM CONSURSOS AÑOS 60 TV YOUTUBE', 'https://img.youtube.com/vi/W-kxMSyqS_s/0.jpg', 'W-kxMSyqS_s'),
(28, 'Demo Vida Real', 'https://img.youtube.com/vi/aeaGIgU7qp4/0.jpg', 'aeaGIgU7qp4'),
(29, 'Medjugorje 1 Bosnia y Herzegovina Epicentro Ciudad 360', 'https://img.youtube.com/vi/UdeRMwy5_O8/0.jpg', 'UdeRMwy5_O8'),
(30, 'Piramide Escalonada', 'https://img.youtube.com/vi/dFLquOyI-qU/0.jpg', 'dFLquOyI-qU'),
(31, 'Dentro de la Piramide de Teti injected', 'https://img.youtube.com/vi/Snd_U4UAJUs/0.jpg', 'Snd_U4UAJUs'),
(32, 'Belen gigante Plaza del Pilar injected', 'https://img.youtube.com/vi/__x1miOcV-Q/0.jpg', '__x1miOcV-Q'),
(33, 'Alan Walker Sing me to sleep LIVE 360 Barcelona', 'https://img.youtube.com/vi/pdRLpDK29tU/0.jpg', 'pdRLpDK29tU'),
(34, 'Vespa', 'https://img.youtube.com/vi/OQf81eY4mQk/0.jpg', 'OQf81eY4mQk');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `video`
--
ALTER TABLE `video`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `usuario`
--
ALTER TABLE `usuario`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT de la tabla `video`
--
ALTER TABLE `video`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
